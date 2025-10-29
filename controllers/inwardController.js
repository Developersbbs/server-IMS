const Inward = require('../models/Inward');
const Product = require('../models/Product');
const asyncHandler = require('express-async-handler');

// @desc    Create a new inward (GRN)
// @route   POST /api/inwards
// @access  Private
const createInward = asyncHandler(async (req, res) => {
  console.log('📥 Received inward creation request');
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  
  const {
    supplier,
    purchaseOrder,
    items,
    invoiceNumber,
    invoiceDate,
    deliveryChallanNumber,
    vehicleNumber,
    notes,
    qualityCheckStatus,
    qualityCheckNotes
  } = req.body;

  // Check if user is authenticated
  if (!req.user || !req.user.id) {
    console.error('❌ User not authenticated');
    res.status(401);
    throw new Error('User not authenticated');
  }
  
  console.log('✅ User authenticated:', req.user.id);

  // Validate items
  if (!items || items.length === 0) {
    res.status(400);
    throw new Error('Inward must have at least one item');
  }

  // Validate each item
  for (const item of items) {
    if (!item.product || item.product.trim() === '') {
      res.status(400);
      throw new Error('Each item must have a product');
    }

    if (item.receivedQuantity <= 0 || item.unitCost < 0) {
      res.status(400);
      throw new Error('Received quantity must be positive and unit cost cannot be negative');
    }
  }

  // Process items - handle both existing products and new product names
  console.log('🔄 Processing items...');
  const processedItems = await Promise.all(items.map(async (item, index) => {
    console.log(`Processing item ${index + 1}:`, item);
    let productId = item.product;
    let productName = '';

    // Check if product is an existing product ID or new product name
    if (typeof item.product === 'string' && item.product.match(/^[0-9a-fA-F]{24}$/)) {
      // It's a MongoDB ObjectId - existing product
      console.log(`Item ${index + 1}: Valid ObjectId detected`);
      const existingProduct = await Product.findById(item.product);
      if (!existingProduct) {
        console.error(`❌ Product with ID ${item.product} not found`);
        throw new Error(`Product with ID ${item.product} not found`);
      }
      productId = existingProduct._id;
      productName = existingProduct.name;
      console.log(`Item ${index + 1}: Found product - ${productName}`);
    } else {
      // It's a new product name - store as string
      console.log(`Item ${index + 1}: New product name detected`);
      productName = item.product.trim();
      productId = productName;
    }

    const processedItem = {
      product: productId,
      productName: productName,
      orderedQuantity: item.orderedQuantity || 0,
      receivedQuantity: item.receivedQuantity,
      unitCost: item.unitCost,
      total: item.receivedQuantity * item.unitCost,
      batchNumber: item.batchNumber,
      manufacturingDate: item.manufacturingDate,
      expiryDate: item.expiryDate,
      notes: item.notes
    };
    
    console.log(`Item ${index + 1} processed:`, processedItem);
    return processedItem;
  }));
  
  console.log('✅ All items processed successfully');

  // Calculate total amount
  const totalAmount = processedItems.reduce((sum, item) => sum + item.total, 0);
  console.log('💰 Calculated total amount:', totalAmount);

  // Prepare inward data
  const inwardData = {
    supplier,
    items: processedItems,
    totalAmount,
    invoiceNumber,
    invoiceDate,
    deliveryChallanNumber,
    vehicleNumber,
    notes,
    qualityCheckStatus,
    qualityCheckNotes,
    createdBy: req.user.id
  };

  // Only add purchaseOrder if it's a valid ObjectId
  if (purchaseOrder && typeof purchaseOrder === 'string' && purchaseOrder.trim() !== '' && purchaseOrder.match(/^[0-9a-fA-F]{24}$/)) {
    inwardData.purchaseOrder = purchaseOrder;
    console.log('✅ Valid purchase order added:', purchaseOrder);
  } else if (purchaseOrder) {
    console.log('⚠️ Invalid purchase order ignored:', purchaseOrder);
  }

  // Create inward
  console.log('💾 Creating inward with data:', JSON.stringify(inwardData, null, 2));
  
  let inward;
  try {
    // Create a new inward document
    inward = new Inward(inwardData);
    console.log('📝 Inward document created, about to save...');
    
    // Save the document (this will trigger pre-save hooks)
    await inward.save();
    console.log('✅ Inward saved successfully:', inward._id);
    console.log('✅ GRN Number:', inward.grnNumber);

    // Populate the created inward
    await inward.populate([
      { path: 'supplier', select: 'name email phone' },
      { path: 'purchaseOrder', select: 'purchaseOrderNumber' },
      { path: 'createdBy', select: 'name email' }
    ]);
    console.log('✅ Inward populated successfully');
  } catch (error) {
    console.error('❌ Error creating inward:', error);
    console.error('Error details:', error.message);
    if (error.errors) {
      console.error('Validation errors:', Object.keys(error.errors));
      Object.keys(error.errors).forEach(key => {
        console.error(`  - ${key}:`, error.errors[key].message);
      });
    }
    throw error;
  }

  // Handle population for mixed product types - populate product details
  const inwardObj = inward.toObject ? inward.toObject() : inward;
  
  // Populate product details for each item
  for (let i = 0; i < inwardObj.items.length; i++) {
    const item = inwardObj.items[i];
    
    // If product is an ObjectId, fetch the product details
    if (typeof item.product === 'object' && item.product._id) {
      // Already populated by mongoose
      inwardObj.items[i].product = {
        _id: item.product._id,
        name: item.product.name || item.productName
      };
    } else if (typeof item.product === 'string' && item.product.match(/^[0-9a-fA-F]{24}$/)) {
      // Fetch product details
      const productDetails = await Product.findById(item.product);
      if (productDetails) {
        inwardObj.items[i].product = {
          _id: productDetails._id,
          name: productDetails.name
        };
      } else {
        // Product not found, use productName
        inwardObj.items[i].product = {
          name: item.productName
        };
      }
    } else {
      // New product name (string)
      inwardObj.items[i].product = {
        name: item.productName || item.product
      };
    }
  }

  res.status(201).json(inwardObj);
});

// @desc    Get all inwards
// @route   GET /api/inwards
// @access  Private
const getInwards = asyncHandler(async (req, res) => {
  // Check if user is authenticated
  if (!req.user || !req.user.id) {
    res.status(401);
    throw new Error('User not authenticated');
  }

  const {
    status,
    supplier,
    purchaseOrder,
    page = 1,
    limit = 10,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    search,
    startDate,
    endDate
  } = req.query;

  let query = {};

  // Filter by status
  if (status) {
    query.status = status;
  }

  // Filter by supplier
  if (supplier) {
    query.supplier = supplier;
  }

  // Filter by purchase order
  if (purchaseOrder) {
    query.purchaseOrder = purchaseOrder;
  }

  // Date range filter
  if (startDate || endDate) {
    query.receivedDate = {};
    if (startDate) query.receivedDate.$gte = new Date(startDate);
    if (endDate) query.receivedDate.$lte = new Date(endDate);
  }

  // Search by GRN number, invoice number, or notes
  if (search) {
    query.$or = [
      { grnNumber: { $regex: search, $options: 'i' } },
      { invoiceNumber: { $regex: search, $options: 'i' } },
      { deliveryChallanNumber: { $regex: search, $options: 'i' } },
      { notes: { $regex: search, $options: 'i' } }
    ];
  }
  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    populate: [
      { path: 'supplier', select: 'name email phone' },
      { path: 'items.product', select: 'name sku' },
      { path: 'purchaseOrder', select: 'purchaseOrderNumber' },
      { path: 'createdBy', select: 'name email' },
      { path: 'approvedBy', select: 'name email' }
    ],
    sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 }
  };

  const inwards = await Inward.paginate(query, options);

  // Handle population for mixed product types
  if (inwards.docs && inwards.docs.length > 0) {
    for (let docIndex = 0; docIndex < inwards.docs.length; docIndex++) {
      const inward = inwards.docs[docIndex];
      const inwardObj = inward.toObject ? inward.toObject() : inward;
      
      // Populate product details for each item
      for (let i = 0; i < inwardObj.items.length; i++) {
        const item = inwardObj.items[i];
        
        if (typeof item.product === 'object' && item.product._id) {
          // Already populated
          inwardObj.items[i].product = {
            _id: item.product._id,
            name: item.product.name || item.productName
          };
        } else if (typeof item.product === 'string' && item.product.match(/^[0-9a-fA-F]{24}$/)) {
          const productDetails = await Product.findById(item.product);
          if (productDetails) {
            inwardObj.items[i].product = {
              _id: productDetails._id,
              name: productDetails.name
            };
          } else {
            inwardObj.items[i].product = {
              name: item.productName
            };
          }
        } else {
          inwardObj.items[i].product = {
            name: item.productName || item.product
          };
        }
      }
      
      inwards.docs[docIndex] = inwardObj;
    }
  }

  res.json(inwards);
});

// @desc    Get single inward
// @route   GET /api/inwards/:id
// @access  Private
const getInward = asyncHandler(async (req, res) => {
  // Check if user is authenticated
  if (!req.user || !req.user.id) {
    res.status(401);
    throw new Error('User not authenticated');
  }

  const inward = await Inward.findById(req.params.id)
    .populate('supplier')
    .populate('items.product')
    .populate('purchaseOrder')
    .populate('createdBy', 'name email')
    .populate('approvedBy', 'name email');

  if (!inward) {
    res.status(404);
    throw new Error('Inward not found');
  }

  // Handle population for mixed product types
  const inwardObj = inward.toObject ? inward.toObject() : inward;
  
  // Populate product details for each item
  for (let i = 0; i < inwardObj.items.length; i++) {
    const item = inwardObj.items[i];
    
    if (typeof item.product === 'object' && item.product._id) {
      // Already populated
      inwardObj.items[i].product = {
        _id: item.product._id,
        name: item.product.name || item.productName
      };
    } else if (typeof item.product === 'string' && item.product.match(/^[0-9a-fA-F]{24}$/)) {
      const productDetails = await Product.findById(item.product);
      if (productDetails) {
        inwardObj.items[i].product = {
          _id: productDetails._id,
          name: productDetails.name
        };
      } else {
        inwardObj.items[i].product = {
          name: item.productName
        };
      }
    } else {
      inwardObj.items[i].product = {
        name: item.productName || item.product
      };
    }
  }

  res.json(inwardObj);
});

// @desc    Update inward
// @route   PUT /api/inwards/:id
// @access  Private
const updateInward = asyncHandler(async (req, res) => {
  // Check if user is authenticated
  if (!req.user || !req.user.id) {
    res.status(401);
    throw new Error('User not authenticated');
  }

  const inward = await Inward.findById(req.params.id);

  if (!inward) {
    res.status(404);
    throw new Error('Inward not found');
  }

  // Check if inward can be modified
  if (!inward.canBeModified()) {
    res.status(400);
    throw new Error(`Cannot update inward with status: ${inward.status}`);
  }

  // Only allow the creator or admin to update
  if (inward.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Not authorized to update this inward');
  }

  const {
    supplier,
    items,
    invoiceNumber,
    invoiceDate,
    deliveryChallanNumber,
    vehicleNumber,
    notes,
    qualityCheckStatus,
    qualityCheckNotes
  } = req.body;

  // Validate items if provided
  if (items) {
    if (items.length === 0) {
      res.status(400);
      throw new Error('Inward must have at least one item');
    }

    for (const item of items) {
      if (!item.product || item.product.trim() === '') {
        res.status(400);
        throw new Error('Each item must have a product');
      }

      if (item.receivedQuantity <= 0 || item.unitCost < 0) {
        res.status(400);
        throw new Error('Received quantity must be positive and unit cost cannot be negative');
      }
    }
  }

  // Process items if provided - handle both existing products and new product names
  if (items) {
    inward.items = await Promise.all(items.map(async (item) => {
      let productId = item.product;
      let productName = '';

      // Check if product is an existing product ID or new product name
      if (item.product.match(/^[0-9a-fA-F]{24}$/)) {
        // It's a MongoDB ObjectId - existing product
        const existingProduct = await Product.findById(item.product);
        if (!existingProduct) {
          throw new Error(`Product with ID ${item.product} not found`);
        }
        productId = existingProduct._id;
        productName = existingProduct.name;
      } else {
        // It's a new product name - store as string
        productName = item.product.trim();
        productId = productName;
      }

      return {
        product: productId,
        productName: productName,
        orderedQuantity: item.orderedQuantity || 0,
        receivedQuantity: item.receivedQuantity,
        unitCost: item.unitCost,
        total: item.receivedQuantity * item.unitCost,
        batchNumber: item.batchNumber,
        manufacturingDate: item.manufacturingDate,
        expiryDate: item.expiryDate,
        notes: item.notes
      };
    }));
  }

  // Update fields
  if (supplier !== undefined) inward.supplier = supplier;
  if (items !== undefined) inward.items = items;
  if (invoiceNumber !== undefined) inward.invoiceNumber = invoiceNumber;
  if (invoiceDate !== undefined) inward.invoiceDate = invoiceDate;
  const updatedInward = await inward.save();

  // Populate the updated inward
  await updatedInward.populate([
    { path: 'supplier', select: 'name email phone' },
    { path: 'items.product', select: 'name sku' },
    { path: 'purchaseOrder', select: 'purchaseOrderNumber' },
    { path: 'createdBy', select: 'name email' },
    { path: 'approvedBy', select: 'name email' }
  ]);

  // Handle population for mixed product types
  const updatedInwardObj = updatedInward.toObject ? updatedInward.toObject() : updatedInward;
  updatedInwardObj.items = updatedInwardObj.items.map(item => ({
    ...item,
    product: (typeof item.product === 'string' && item.product.match(/^[0-9a-fA-F]{24}$/)) ? item.product : null
  }));

  res.json(updatedInwardObj);
});

// @desc    Delete inward
// @access  Private/Admin
const deleteInward = asyncHandler(async (req, res) => {
  // Check if user is authenticated
  if (!req.user || !req.user.id) {
    res.status(401);
    throw new Error('User not authenticated');
  }

  const inward = await Inward.findById(req.params.id);

  if (!inward) {
    res.status(404);
    throw new Error('Inward not found');
  }

  // Check if inward can be deleted
  if (!inward.canBeModified()) {
    res.status(400);
    throw new Error(`Cannot delete inward with status: ${inward.status}`);
  }

  await Inward.findByIdAndDelete(req.params.id);
  res.json({ message: 'Inward deleted successfully' });
});

// @desc    Approve inward
// @route   PUT /api/inwards/:id/approve
// @access  Private/Admin
const approveInward = asyncHandler(async (req, res) => {
  // Check if user is authenticated
  if (!req.user || !req.user.id) {
    res.status(401);
    throw new Error('User not authenticated');
  }

  const inward = await Inward.findById(req.params.id);

  if (!inward) {
    res.status(404);
    throw new Error('Inward not found');
  }

  if (!inward.canBeApproved()) {
    res.status(400);
    throw new Error(`Cannot approve inward with status: ${inward.status}`);
  }

  inward.status = 'approved';
  inward.approvedBy = req.user.id;
  inward.approvalDate = new Date();

  // Update inventory for approved inwards (only for existing products)
  for (const item of inward.items) {
    // Only update inventory if it's an existing product (ObjectId)
    if (typeof item.product === 'string' && item.product.match(/^[0-9a-fA-F]{24}$/)) {
      const product = await Product.findById(item.product);
      if (product) {
        product.quantity += item.receivedQuantity;
        product.batchNumber = item.batchNumber;
        product.manufacturingDate = item.manufacturingDate;
        if (item.expiryDate) {
          product.expiryDate = item.expiryDate;
        }
        await product.save();
      }
    }
  }

  const approvedInward = await inward.save();

  // Populate the approved inward
  await approvedInward.populate([
    { path: 'supplier', select: 'name email phone' },
    { path: 'items.product', select: 'name sku' },
    { path: 'purchaseOrder', select: 'purchaseOrderNumber' },
    { path: 'createdBy', select: 'name email' },
    { path: 'approvedBy', select: 'name email' }
  ]);

  // Handle population for mixed product types
  const approvedInwardObj = approvedInward.toObject ? approvedInward.toObject() : approvedInward;
  approvedInwardObj.items = approvedInwardObj.items.map(item => ({
    ...item,
    product: (typeof item.product === 'string' && item.product.match(/^[0-9a-fA-F]{24}$/)) ? item.product : null
  }));

  res.json(approvedInwardObj);
});

// @desc    Reject inward
// @route   PUT /api/inwards/:id/reject
// @access  Private/Admin
const rejectInward = asyncHandler(async (req, res) => {
  // Check if user is authenticated
  if (!req.user || !req.user.id) {
    res.status(401);
    throw new Error('User not authenticated');
  }

  const { rejectionReason } = req.body;
  const inward = await Inward.findById(req.params.id);

  if (!inward) {
    res.status(404);
    throw new Error('Inward not found');
  }

  inward.status = 'rejected';
  inward.rejectionReason = rejectionReason;
  inward.rejectedBy = req.user.id;
  inward.rejectionDate = new Date();

  const rejectedInward = await inward.save();

  // Populate the rejected inward
  await rejectedInward.populate([
    { path: 'supplier', select: 'name email phone' },
    { path: 'items.product', select: 'name sku' },
    { path: 'purchaseOrder', select: 'purchaseOrderNumber' },
    { path: 'createdBy', select: 'name email' },
    { path: 'approvedBy', select: 'name email' }
  ]);

  // Handle population for mixed product types
  const rejectedInwardObj = rejectedInward.toObject ? rejectedInward.toObject() : rejectedInward;
  rejectedInwardObj.items = rejectedInwardObj.items.map(item => ({
    ...item,
    product: (typeof item.product === 'string' && item.product.match(/^[0-9a-fA-F]{24}$/)) ? item.product : null
  }));

  res.json(rejectedInwardObj);
});

// @desc    Complete inward
// @route   PUT /api/inwards/:id/complete
// @access  Private/Admin
const completeInward = asyncHandler(async (req, res) => {
  // Check if user is authenticated
  if (!req.user || !req.user.id) {
    res.status(401);
    throw new Error('User not authenticated');
  }

  const inwardToComplete = await Inward.findById(req.params.id);

  if (!inwardToComplete) {
    res.status(404);
    throw new Error('Inward not found');
  }

  if (inwardToComplete.status !== 'approved') {
    res.status(400);
    throw new Error('Only approved inwards can be completed');
  }

  inwardToComplete.status = 'completed';
  inwardToComplete.completedBy = req.user.id;
  inwardToComplete.completionDate = new Date();

  const completedInward = await inwardToComplete.save();

  // Populate the completed inward
  await completedInward.populate([
    { path: 'supplier', select: 'name email phone' },
    { path: 'items.product', select: 'name sku' },
    { path: 'purchaseOrder', select: 'purchaseOrderNumber' },
    { path: 'createdBy', select: 'name email' },
    { path: 'approvedBy', select: 'name email' }
  ]);

  // Handle population for mixed product types
  const completedInwardObj = completedInward.toObject ? completedInward.toObject() : completedInward;
  completedInwardObj.items = completedInwardObj.items.map(item => ({
    ...item,
    product: (typeof item.product === 'string' && item.product.match(/^[0-9a-fA-F]{24}$/)) ? item.product : null
  }));

  res.json(completedInwardObj);
});

// @desc    Get inward statistics
// @access  Private
const getInwardStats = asyncHandler(async (req, res) => {
  // Check if user is authenticated
  if (!req.user || !req.user.id) {
    res.status(401);
    throw new Error('User not authenticated');
  }

  const stats = await Inward.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$totalAmount' }
      }
    }
  ]);

  const totalInwards = await Inward.countDocuments();
  const totalValue = await Inward.aggregate([
    { $group: { _id: null, total: { $sum: '$totalAmount' } } }
  ]);

  res.json({
    statusBreakdown: stats,
    totalInwards,
    totalValue: totalValue[0]?.total || 0
  });
});

module.exports = {
  createInward,
  getInwards,
  getInward,
  updateInward,
  deleteInward,
  approveInward,
  rejectInward,
  completeInward,
  getInwardStats
};
