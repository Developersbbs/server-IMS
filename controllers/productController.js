const Product = require('../models/Product');

// @desc    Fetch all products with filtering and sorting
// @route   GET /api/products
// @access  Public
const getProducts = async (req, res) => {
  try {
    const { 
      search, 
      category, 
      sortBy = 'name', 
      sortOrder = 'asc',
      page = 1,
      limit = 50,
      stockStatus 
    } = req.query;

    // Build query object
    let query = {};

    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { _id: search } // Allow search by product ID
      ];
    }

    // Category filter
    if (category && category !== 'all') {
      query.category = category;
    }

    // Stock status filter
    if (stockStatus) {
      switch (stockStatus) {
        case 'out_of_stock':
          query.quantity = 0;
          break;
        case 'low_stock':
          query.quantity = { $gt: 0, $lte: 10 };
          break;
        case 'in_stock':
          query.quantity = { $gt: 10 };
          break;
      }
    }

    // Build sort object
    const sortObj = {};
    const order = sortOrder === 'desc' ? -1 : 1;
    sortObj[sortBy] = order;

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Execute query
    const products = await Product.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await Product.countDocuments(query);

    res.status(200).json({
      products,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Server Error: Could not fetch products.', 
      error: error.message 
    });
  }
};

// @desc    Fetch a single product by ID
// @route   GET /api/products/:id
// @access  Public
const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (product) {
      res.status(200).json(product);
    } else {
      res.status(404).json({ message: 'Product not found' });
    }
  } catch (error) {
    // Handle invalid ObjectId
    if (error.name === 'CastError') {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.status(500).json({ 
      message: 'Server Error: Could not fetch product.', 
      error: error.message 
    });
  }
};

// @desc    Create a new product
// @route   POST /api/products
// @access  Private/Admin
const createProduct = async (req, res) => {
  const { name, description, image, price, category, quantity } = req.body;

  // Enhanced validation
  if (!name || !price || !category) {
    return res.status(400).json({ 
      message: 'Please provide all required fields: name, price, and category.' 
    });
  }

  if (price < 0) {
    return res.status(400).json({ 
      message: 'Price cannot be negative.' 
    });
  }

  if (quantity !== undefined && quantity < 0) {
    return res.status(400).json({ 
      message: 'Quantity cannot be negative.' 
    });
  }

  try {
    // Check for duplicate product name in same category
    const existingProduct = await Product.findOne({ 
      name: { $regex: new RegExp(`^${name}$`, 'i') }, 
      category: { $regex: new RegExp(`^${category}$`, 'i') } 
    });

    if (existingProduct) {
      return res.status(400).json({ 
        message: 'A product with this name already exists in this category.' 
      });
    }

    const product = new Product({
      name: name.trim(),
      description: description ? description.trim() : '',
      image,
      price: parseFloat(price),
      category: category.trim(),
      quantity: quantity !== undefined ? parseInt(quantity) : 0,
    });

    const createdProduct = await product.save();
    res.status(201).json(createdProduct);
  } catch (error) {
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation Error', 
        errors 
      });
    }
    res.status(400).json({ 
      message: 'Error creating product.', 
      error: error.message 
    });
  }
};

// @desc    Update a product by ID
// @route   PUT /api/products/:id
// @access  Private/Admin
const updateProduct = async (req, res) => {
  const { name, description, image, price, category, quantity } = req.body;

  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Validate updated values
    if (price !== undefined && price < 0) {
      return res.status(400).json({ 
        message: 'Price cannot be negative.' 
      });
    }

    if (quantity !== undefined && quantity < 0) {
      return res.status(400).json({ 
        message: 'Quantity cannot be negative.' 
      });
    }

    // Check for duplicate product name (excluding current product)
    if (name && name !== product.name) {
      const existingProduct = await Product.findOne({ 
        name: { $regex: new RegExp(`^${name}$`, 'i') }, 
        category: category || product.category,
        _id: { $ne: req.params.id }
      });

      if (existingProduct) {
        return res.status(400).json({ 
          message: 'A product with this name already exists in this category.' 
        });
      }
    }

    // Update fields
    product.name = name ? name.trim() : product.name;
    product.description = description !== undefined ? description.trim() : product.description;
    product.image = image !== undefined ? image : product.image;
    product.price = price !== undefined ? parseFloat(price) : product.price;
    product.category = category ? category.trim() : product.category;
    product.quantity = quantity !== undefined ? parseInt(quantity) : product.quantity;

    const updatedProduct = await product.save();
    res.status(200).json(updatedProduct);
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ message: 'Product not found' });
    }
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation Error', 
        errors 
      });
    }
    res.status(400).json({ 
      message: 'Error updating product.', 
      error: error.message 
    });
  }
};

// @desc    Update product quantity (for stock management)
// @route   PATCH /api/products/:id/quantity
// @access  Private/Admin
const updateProductQuantity = async (req, res) => {
  const { quantity, operation } = req.body; // operation can be 'set', 'add', 'subtract'

  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    let newQuantity;

    switch (operation) {
      case 'set':
        newQuantity = parseInt(quantity);
        break;
      case 'add':
        newQuantity = product.quantity + parseInt(quantity);
        break;
      case 'subtract':
        newQuantity = product.quantity - parseInt(quantity);
        break;
      default:
        newQuantity = parseInt(quantity);
    }

    // Ensure quantity doesn't go below 0
    if (newQuantity < 0) {
      return res.status(400).json({ 
        message: 'Quantity cannot be negative.' 
      });
    }

    product.quantity = newQuantity;
    const updatedProduct = await product.save();

    res.status(200).json({
      message: 'Quantity updated successfully',
      product: updatedProduct
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.status(400).json({ 
      message: 'Error updating product quantity.', 
      error: error.message 
    });
  }
};

// @desc    Delete a product by ID
// @route   DELETE /api/products/:id
// @access  Private/Admin
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    await product.deleteOne();
    res.status(200).json({ 
      message: 'Product removed successfully',
      productId: req.params.id
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.status(500).json({ 
      message: 'Server Error: Could not delete product.', 
      error: error.message 
    });
  }
};

// @desc    Get product categories
// @route   GET /api/products/categories
// @access  Public
const getCategories = async (req, res) => {
  try {
    const categories = await Product.distinct('category');
    res.status(200).json(categories.sort());
  } catch (error) {
    res.status(500).json({ 
      message: 'Server Error: Could not fetch categories.', 
      error: error.message 
    });
  }
};

// @desc    Get low stock products
// @route   GET /api/products/low-stock
// @access  Private/Admin
const getLowStockProducts = async (req, res) => {
  try {
    const { threshold = 10 } = req.query;
    
    const lowStockProducts = await Product.find({
      quantity: { $lte: parseInt(threshold), $gte: 0 }
    }).sort({ quantity: 1 });

    res.status(200).json({
      count: lowStockProducts.length,
      products: lowStockProducts
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Server Error: Could not fetch low stock products.', 
      error: error.message 
    });
  }
};

// @desc    Bulk update products
// @route   PATCH /api/products/bulk-update
// @access  Private/Admin
const bulkUpdateProducts = async (req, res) => {
  const { productIds, updateData } = req.body;

  try {
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ 
        message: 'Please provide valid product IDs array.' 
      });
    }

    // Validate update data
    if (updateData.price !== undefined && updateData.price < 0) {
      return res.status(400).json({ 
        message: 'Price cannot be negative.' 
      });
    }

    if (updateData.quantity !== undefined && updateData.quantity < 0) {
      return res.status(400).json({ 
        message: 'Quantity cannot be negative.' 
      });
    }

    const result = await Product.updateMany(
      { _id: { $in: productIds } },
      { $set: updateData }
    );

    res.status(200).json({
      message: 'Products updated successfully',
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    res.status(400).json({ 
      message: 'Error updating products.', 
      error: error.message 
    });
  }
};

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  updateProductQuantity,
  deleteProduct,
  getCategories,
  getLowStockProducts,
  bulkUpdateProducts,
};
