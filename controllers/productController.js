const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');
const { handleStockNotifications } = require('../utils/stockNotifications');

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
      if (!mongoose.Types.ObjectId.isValid(category)) {
        return res.status(400).json({ message: 'Invalid category filter.' });
      }
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

    // Execute query with supplier population
    const products = await Product.find(query)
      .populate('supplier', 'name contactPerson phone email')
      .populate('category', 'name status')
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await Product.countDocuments(query);

    const formattedProducts = products.map((product) => {
      const obj = product.toObject();
      obj.category = obj.category ? { _id: obj.category._id, name: obj.category.name, status: obj.category.status } : null;
      obj.categoryId = obj.category?._id || null;
      return obj;
    });

    res.status(200).json({
      products: formattedProducts,
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
    const product = await Product.findById(req.params.id)
      .populate('supplier', 'name contactPerson phone email')
      .populate('category', 'name status');

    if (product) {
      const formattedProduct = product.toObject();
      formattedProduct.category = formattedProduct.category
        ? { _id: formattedProduct.category._id, name: formattedProduct.category.name, status: formattedProduct.category.status }
        : null;
      formattedProduct.categoryId = formattedProduct.category?._id || null;
      res.status(200).json(formattedProduct);
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
  // Extract all fields from request body
  const { 
    name, 
    description, 
    image, 
    price, 
    category, 
    quantity, 
    supplier, 
    expiryDate, 
    reorderLevel,
    productId,  // Get productId from request body
    batchNumber // Get batchNumber from request body
  } = req.body;

  // Required fields validation
  const requiredFields = ['name', 'price', 'category', 'supplier', 'batchNumber', 'expiryDate'];
  const missingFields = requiredFields.filter(field => !req.body[field] && req.body[field] !== 0);

  if (missingFields.length > 0) {
    return res.status(400).json({ 
      message: `Missing required fields: ${missingFields.join(', ')}`,
      fields: missingFields
    });
  }

  // Data type and format validation
  if (isNaN(price) || price < 0) {
    return res.status(400).json({ 
      message: 'Price must be a non-negative number.' 
    });
  }

  if (quantity !== undefined && (isNaN(quantity) || quantity < 0)) {
    return res.status(400).json({ 
      message: 'Quantity must be a non-negative number.' 
    });
  }

  // Validate expiry date is in the future
  if (new Date(expiryDate) <= new Date()) {
    return res.status(400).json({
      message: 'Expiry date must be in the future.'
    });
  }

  try {
    // Create product data object with all fields
    if (!mongoose.Types.ObjectId.isValid(category)) {
      return res.status(400).json({ message: 'Invalid category.' });
    }

    const categoryDoc = await Category.findById(category);
    if (!categoryDoc || categoryDoc.status !== 'active') {
      return res.status(400).json({
        message: 'Selected category is invalid or inactive.'
      });
    }

    const productData = {
      name: name.trim(),
      description: description ? description.trim() : '',
      price: parseFloat(price),
      category: categoryDoc._id,
      quantity: quantity !== undefined ? parseInt(quantity) : 0,
      supplier: supplier,
      batchNumber: batchNumber ? batchNumber.trim() : '',
      expiryDate: new Date(expiryDate),
      reorderLevel: reorderLevel ? parseInt(reorderLevel) : 10,
      addedDate: new Date()
    };

    // Only add productId if it's provided and not empty
    if (productId && productId.trim()) {
      productData.productId = productId.trim();
    }

    // Only add image if it exists
    if (image) {
      productData.image = image;
    }

    const product = new Product(productData);

    const createdProduct = await product.save();
    await handleStockNotifications(createdProduct, createdProduct.quantity);
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
  const { 
    name, 
    description, 
    image, 
    price, 
    category, 
    quantity, 
    supplier, 
    batchNumber, 
    expiryDate, 
    reorderLevel 
  } = req.body;

  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Validate updated values
    if (price !== undefined && (isNaN(price) || price < 0)) {
      return res.status(400).json({ 
        message: 'Price must be a non-negative number.' 
      });
    }

    if (quantity !== undefined && (isNaN(quantity) || quantity < 0)) {
      return res.status(400).json({ 
        message: 'Quantity must be a non-negative number.' 
      });
    }

    // Validate expiry date if provided
    if (expiryDate && new Date(expiryDate) <= new Date()) {
      return res.status(400).json({
        message: 'Expiry date must be in the future.'
      });
    }

    // Update product fields
    product.name = name !== undefined ? name.trim() : product.name;
    product.description = description !== undefined ? description.trim() : product.description;
    product.image = image !== undefined ? image : product.image;
    product.price = price !== undefined ? parseFloat(price) : product.price;
    if (category !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(category)) {
        return res.status(400).json({ message: 'Invalid category.' });
      }
      const categoryDoc = await Category.findById(category);
      if (!categoryDoc || categoryDoc.status !== 'active') {
        return res.status(400).json({ message: 'Selected category is invalid or inactive.' });
      }
      product.category = categoryDoc._id;
    }
    
    // Update supplier if provided
    if (supplier !== undefined) {
      product.supplier = supplier;
    }
    
    // Update batch number if provided
    if (batchNumber !== undefined) {
      product.batchNumber = batchNumber.trim();
    }
    
    // Update expiry date if provided
    if (expiryDate !== undefined) {
      product.expiryDate = new Date(expiryDate);
    }
    
    // Update reorder level if provided
    if (reorderLevel !== undefined) {
      product.reorderLevel = parseInt(reorderLevel) || 10;
    }
    
    // Only update quantity if it's provided and different
    if (quantity !== undefined) {
      const oldQuantity = product.quantity;
      product.quantity = parseInt(quantity);
      
      // If quantity changed, check stock notifications
      if (oldQuantity !== product.quantity) {
        await handleStockNotifications(product, product.quantity);
      }
    }
    
    const updatedProduct = await product.save();
    res.status(200).json(updatedProduct);
  } catch (error) {
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

    // Check if stock level crosses threshold
    product.quantity = newQuantity;
    const updatedProduct = await product.save();
    await handleStockNotifications(updatedProduct, newQuantity);

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
    const categories = await Product.aggregate([
      {
        $lookup: {
          from: 'categories',
          localField: 'category',
          foreignField: '_id',
          as: 'categoryInfo'
        }
      },
      {
        $unwind: {
          path: '$categoryInfo',
          preserveNullAndEmptyArrays: false
        }
      },
      {
        $match: {
          'categoryInfo.status': 'active'
        }
      },
      {
        $group: {
          _id: '$categoryInfo._id',
          name: { $first: '$categoryInfo.name' },
          status: { $first: '$categoryInfo.status' }
        }
      },
      {
        $project: {
          _id: 1,
          name: 1,
          status: 1
        }
      },
      {
        $sort: { name: 1 }
      }
    ]);

    res.status(200).json(categories);
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