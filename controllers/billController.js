// controllers/billController.js
const mongoose = require('mongoose');
const Bill = require('../models/Bill');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const ProductBatch = require('../models/ProductBatch');
const { handleStockNotifications } = require('../utils/stockNotifications');

const VALID_PAYMENT_METHODS = ['cash', 'card', 'upi', 'bank_transfer', 'credit'];
const VALID_PAYMENT_STATUSES = ['pending', 'paid', 'partial'];

const roundToTwo = (value) => Math.round((Number(value) || 0) * 100) / 100;
const clamp = (value, min, max) => Math.min(Math.max(Number.isFinite(value) ? value : min, min), max);

const normalizePaymentMethod = (method) => {
  if (method === 'bank') {
    return 'bank_transfer';
  }
  if (VALID_PAYMENT_METHODS.includes(method)) {
    return method;
  }
  return 'cash';
};

const normalizePaymentStatus = (status) =>
  VALID_PAYMENT_STATUSES.includes(status) ? status : 'pending';

const calculateFinancials = ({ items, discountPercent, taxPercent, paidAmount, paymentStatus }) => {
  const subtotal = roundToTwo(items.reduce((sum, item) => sum + roundToTwo(item.total || 0), 0));
  const normalizedDiscountPercent = clamp(Number(discountPercent) || 0, 0, 100);
  const discountAmount = roundToTwo((subtotal * normalizedDiscountPercent) / 100);
  const taxableBase = roundToTwo(Math.max(subtotal - discountAmount, 0));
  const normalizedTaxPercent = clamp(Number(taxPercent) || 0, 0, 100);
  const taxAmount = roundToTwo((taxableBase * normalizedTaxPercent) / 100);
  const totalAmount = roundToTwo(taxableBase + taxAmount);

  let normalizedPaymentStatus = normalizePaymentStatus(paymentStatus);
  let normalizedPaidAmount = roundToTwo(Number(paidAmount) || 0);

  if (normalizedPaymentStatus === 'paid') {
    normalizedPaidAmount = totalAmount;
  }

  if (normalizedPaidAmount > totalAmount) {
    normalizedPaidAmount = totalAmount;
  }

  const dueAmount = roundToTwo(Math.max(totalAmount - normalizedPaidAmount, 0));
  if (normalizedPaymentStatus === 'paid' && dueAmount > 0) {
    normalizedPaymentStatus = 'partial';
  }

  return {
    subtotal,
    discountPercent: normalizedDiscountPercent,
    discountAmount,
    taxPercent: normalizedTaxPercent,
    taxAmount,
    totalAmount,
    paidAmount: normalizedPaidAmount,
    dueAmount,
    paymentStatus: normalizedPaymentStatus
  };
};

const parseOptionalDate = (value, fallback = null) => {
  if (!value) {
    return fallback;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};

const httpError = (status, message) => {
  const error = new Error(message);
  error.statusCode = status;
  return error;
};

const notifyProducts = async (productIds) => {
  if (!productIds || productIds.size === 0) {
    return;
  }

  await Promise.all(
    [...productIds].map(async (productId) => {
      const product = await Product.findById(productId);
      if (product) {
        await handleStockNotifications(product, product.quantity);
      }
    })
  );
};

exports.getAllBills = async (req, res) => {
  try {
    const { page = 1, limit = 10, startDate, endDate, paymentStatus } = req.query;
    
    const filter = {};
    if (startDate && endDate) {
      filter.billDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    if (paymentStatus) {
      filter.paymentStatus = paymentStatus;
    }
    
    const bills = await Bill.find(filter)
      .populate('customerId', 'name email phone')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });
    
    const total = await Bill.countDocuments(filter);
    
    res.status(200).json({
      bills,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (err) {
    console.error("Error in getAllBills:", err); // Log for debugging
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.getBillById = async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id).populate('customerId');
    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }
    res.status(200).json(bill);
  } catch (err) {
    console.error("Error in getBillById:", err); // Log for debugging
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.createBill = async (req, res) => {
  try {
    const payload = { ...req.body };
    payload.createdBy = req.user._id;

    if (!payload.customerId) {
      throw httpError(400, 'Customer ID is required.');
    }

    const customer = await Customer.findById(payload.customerId);
    if (!customer) {
      throw httpError(400, 'Invalid customer ID.');
    }

    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      throw httpError(400, 'Bill must contain at least one item.');
    }

    const items = [];
    const updatedProducts = new Map();

    for (let index = 0; index < payload.items.length; index += 1) {
      const reqItem = payload.items[index];
      if (!reqItem?.productId) {
        throw httpError(400, `Item ${index + 1}: Product ID is required.`);
      }

      const requestedQty = Number(reqItem.quantity) || 0;
      if (requestedQty <= 0) {
        throw httpError(400, `Item ${index + 1}: Quantity must be greater than 0.`);
      }

      const product = await Product.findById(reqItem.productId);
      if (!product) {
        throw httpError(400, `Item ${index + 1}: Invalid product selected.`);
      }

      if (product.quantity < requestedQty) {
        throw httpError(400, `Item ${index + 1}: Only ${product.quantity} units available for '${product.name}'.`);
      }

      let remaining = requestedQty;
      const batchesToSave = [];

      if (reqItem.batchNumber) {
        const batch = await ProductBatch.findOne({ product: product._id, batchNumber: reqItem.batchNumber });
        if (!batch) {
          throw httpError(400, `Item ${index + 1}: Batch '${reqItem.batchNumber}' not found for '${product.name}'.`);
        }
        if (batch.quantity < remaining) {
          throw httpError(400, `Item ${index + 1}: Only ${batch.quantity} units available in batch '${reqItem.batchNumber}' for '${product.name}'.`);
        }
        const price = roundToTwo(batch.unitCost);
        const total = roundToTwo(price * remaining);
        items.push({
          productId: product._id,
          batchNumber: reqItem.batchNumber,
          name: product.name,
          quantity: remaining,
          price,
          total
        });
        batch.quantity -= remaining;
        batchesToSave.push(batch);
        product.quantity -= remaining;
        remaining = 0;
      } else {
        const batches = await ProductBatch.find({ product: product._id, quantity: { $gt: 0 } })
          .sort({ receivedDate: 1, manufacturingDate: 1, createdAt: 1 });
        for (const batch of batches) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, batch.quantity);
          if (take <= 0) continue;
          const price = roundToTwo(batch.unitCost);
          const total = roundToTwo(price * take);
          items.push({
            productId: product._id,
            batchNumber: batch.batchNumber,
            name: product.name,
            quantity: take,
            price,
            total
          });
          batch.quantity -= take;
          batchesToSave.push(batch);
          product.quantity -= take;
          remaining -= take;
        }
        if (remaining > 0) {
          throw httpError(400, `Item ${index + 1}: Insufficient batch stock for '${product.name}'. Needed ${requestedQty}.`);
        }
      }

      await Promise.all(batchesToSave.map(b => b.save({ validateModifiedOnly: true })));
      await product.save({ validateModifiedOnly: true });
      updatedProducts.set(String(product._id), product);
    }

    const financials = calculateFinancials({
      items,
      discountPercent: payload.discountPercent,
      taxPercent: payload.taxPercent,
      paidAmount: payload.paidAmount,
      paymentStatus: payload.paymentStatus
    });

    const bill = new Bill({
      customerId: customer._id,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone || '',
      items,
      ...financials,
      taxAmount: financials.taxAmount,
      discount: financials.discountAmount,
      paymentMethod: normalizePaymentMethod(payload.paymentMethod),
      paymentStatus: financials.paymentStatus,
      billDate: parseOptionalDate(payload.billDate, new Date()),
      dueDate: parseOptionalDate(payload.dueDate, null),
      notes: payload.notes || '',
      createdBy: payload.createdBy
    });

    await bill.save();

    if (bill.paymentMethod === 'credit' || bill.paymentStatus !== 'paid') {
      await Customer.findByIdAndUpdate(
        bill.customerId,
        { $inc: { outstandingBalance: bill.dueAmount } },
        { new: true, runValidators: true }
      );
    }

    await notifyProducts(new Set([...updatedProducts.keys()]));
    await bill.populate('customerId', 'name email phone');

    res.status(201).json({
      message: 'Bill created successfully',
      bill
    });
  } catch (err) {
    console.error("Error creating bill:", err); // Log the actual error for debugging

    if (err.statusCode) {
      return res.status(err.statusCode).json({
        message: err.message,
        error: err.details || undefined
      });
    }

    // Differentiate between validation errors and server errors
    if (err.name === 'ValidationError') {
        // Extract specific error messages from Mongoose ValidationError
        const messages = Object.values(err.errors).map(e => e.message);
        return res.status(400).json({ message: 'Validation Error', errors: messages }); // Use 'errors' array
    }
    // Mongoose CastError (e.g., invalid ObjectId format)
    if (err.name === 'CastError') {
         return res.status(400).json({ message: 'Invalid data format', error: err.message });
    }
    // Handle other potential Mongoose errors (e.g., duplicate key)
    if (err.code === 11000) { // Duplicate key error
         const duplicateField = Object.keys(err.keyValue)[0];
         return res.status(400).json({ message: `Duplicate entry`, error: `A bill with this ${duplicateField} already exists.` });
    }

    res.status(500).json({ message: 'Server error during bill creation', error: err.message });
  }
};

exports.updateBill = async (req, res) => {
  try {
    const existingBill = await Bill.findById(req.params.id);
    if (!existingBill) {
      return res.status(404).json({ message: 'Bill not found' });
    }

    const payload = { ...req.body };

    const customer = await Customer.findById(existingBill.customerId);
    if (!customer) {
      throw httpError(400, 'Associated customer no longer exists.');
    }

    const originalItems = existingBill.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity
    }));

    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      throw httpError(400, 'Bill must contain at least one item.');
    }

    const adjustmentMap = new Map();

    const applyAdjustment = (productId, delta) => {
      const key = String(productId);
      adjustmentMap.set(key, (adjustmentMap.get(key) || 0) + delta);
    };

    originalItems.forEach(({ productId, quantity }) => applyAdjustment(productId, quantity));

    const items = [];

    for (let index = 0; index < payload.items.length; index += 1) {
      const item = payload.items[index];
      if (!item?.productId) {
        throw httpError(400, `Item ${index + 1}: Product ID is required.`);
      }

      const quantity = Number(item.quantity) || 0;
      if (quantity <= 0) {
        throw httpError(400, `Item ${index + 1}: Quantity must be greater than 0.`);
      }

      const price = roundToTwo(Number(item.price) || 0);
      if (price < 0) {
        throw httpError(400, `Item ${index + 1}: Price cannot be negative.`);
      }

      const total = roundToTwo(price * quantity);
      applyAdjustment(item.productId, -quantity);

      items.push({
        productId: item.productId,
        name: item.name,
        quantity,
        price,
        total
      });
    }

    const updatedProducts = new Map();
    for (const [productId, delta] of adjustmentMap.entries()) {
      if (delta === 0) {
        continue;
      }
      const product = await Product.findById(productId);
      if (!product) {
        throw httpError(400, 'One or more referenced products no longer exist.');
      }
      const newQuantity = product.quantity + delta;
      if (newQuantity < 0) {
        throw httpError(400, `Insufficient stock for product '${product.name}'. Available: ${product.quantity}`);
      }
      product.quantity = newQuantity;
      await product.save({ validateModifiedOnly: true });
      updatedProducts.set(productId, product);
    }

    const financials = calculateFinancials({
      items,
      discountPercent: payload.discountPercent ?? existingBill.discountPercent,
      taxPercent: payload.taxPercent ?? existingBill.taxPercent,
      paidAmount: payload.paidAmount ?? existingBill.paidAmount,
      paymentStatus: payload.paymentStatus ?? existingBill.paymentStatus
    });

    const outstandingDelta = roundToTwo(existingBill.dueAmount * -1);
    const newOutstanding = financials.dueAmount;

    const updatedBill = await Bill.findByIdAndUpdate(
      existingBill._id,
      {
        items,
        subtotal: financials.subtotal,
        taxPercent: financials.taxPercent,
        taxAmount: financials.taxAmount,
        discountPercent: financials.discountPercent,
        discount: financials.discountAmount,
        totalAmount: financials.totalAmount,
        paidAmount: financials.paidAmount,
        dueAmount: financials.dueAmount,
        paymentStatus: financials.paymentStatus,
        paymentMethod: normalizePaymentMethod(payload.paymentMethod ?? existingBill.paymentMethod),
        billDate: parseOptionalDate(payload.billDate, existingBill.billDate),
        dueDate: parseOptionalDate(payload.dueDate, existingBill.dueDate),
        notes: payload.notes ?? existingBill.notes
      },
      { new: true, runValidators: true }
    ).populate('customerId', 'name email phone');

    await Customer.findByIdAndUpdate(
      customer._id,
      { $inc: { outstandingBalance: outstandingDelta + newOutstanding } },
      { new: true, runValidators: true }
    );

    await notifyProducts(new Set([...updatedProducts.keys()]));

    res.status(200).json({
      message: 'Bill updated successfully',
      bill: updatedBill
    });
  } catch (err) {
    console.error("Error in updateBill:", err);
    if (err.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ message: 'Validation Error', errors: messages });
    }
    if (err.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid data format', error: err.message });
    }
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.deleteBill = async (req, res) => {
  try {
    const bill = await Bill.findByIdAndDelete(req.params.id);
    
    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }
    
    res.status(200).json({ message: 'Bill deleted successfully' });
  } catch (err) {
    console.error("Error in deleteBill:", err); // Log for debugging
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.getBillsStats = async (req, res) => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const [
      totalBills,
      todayBills,
      monthlyBills,
      pendingPayments,
      totalRevenue
    ] = await Promise.all([
      Bill.countDocuments(),
      Bill.countDocuments({ billDate: { $gte: startOfDay } }),
      Bill.countDocuments({ billDate: { $gte: startOfMonth } }),
      Bill.countDocuments({ paymentStatus: 'pending' }),
      Bill.aggregate([
        { $match: { paymentStatus: 'paid' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ])
    ]);

    res.status(200).json({
      totalBills,
      todayBills,
      monthlyBills,
      pendingPayments,
      totalRevenue: totalRevenue[0]?.total || 0
    });
  } catch (err) {
    console.error("Error in getBillsStats:", err); // Log for debugging
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.generateInvoice = async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id).populate('customerId');
    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }
    
    // Simple invoice generation (you can use libraries like pdfkit for PDF generation)
    const invoice = {
      billNumber: bill.billNumber,
      billDate: bill.billDate,
      customer: bill.customerId,
      items: bill.items,
      subtotal: bill.subtotal,
      taxAmount: bill.taxAmount,
      discount: bill.discount,
      totalAmount: bill.totalAmount,
      paymentStatus: bill.paymentStatus
    };
    
    res.status(200).json(invoice);
  } catch (err) {
    console.error("Error in generateInvoice:", err); // Log for debugging
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.getSellingReport = async (req, res) => {
  try {
    const { startDate, endDate, productId, categoryId, sortBy = 'revenue', sortOrder = 'desc' } = req.query;

    // Build match conditions for bills
    let matchConditions = {};

    // Date range filter
    if (startDate && endDate) {
      matchConditions.billDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Product filter
    if (productId && productId !== 'all') {
      if (!mongoose.Types.ObjectId.isValid(productId)) {
        return res.status(400).json({ message: 'Invalid product ID' });
      }
      matchConditions['items.productId'] = productId;
    }

    // Category filter - we'll need to join with products
    let categoryFilter = {};
    if (categoryId && categoryId !== 'all') {
      if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        return res.status(400).json({ message: 'Invalid category ID' });
      }
      categoryFilter.category = categoryId;
    }

    // Aggregation pipeline to get selling data
    const pipeline = [
      // Match bills by date range
      { $match: matchConditions },

      // Unwind items array to get individual product sales
      { $unwind: '$items' },

      // Lookup product details
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'product'
        }
      },

      // Unwind product array
      { $unwind: '$product' },

      // Apply category filter if specified
      ...(Object.keys(categoryFilter).length > 0 ? [{ $match: { 'product': categoryFilter } }] : []),

      // Group by product to calculate totals
      {
        $group: {
          _id: '$items.productId',
          productName: { $first: '$items.name' },
          category: { $first: '$product.category' },
          totalQuantity: { $sum: '$items.quantity' },
          totalRevenue: { $sum: '$items.total' },
          averagePrice: { $avg: '$items.price' },
          billsCount: { $addToSet: '$_id' },
          minPrice: { $min: '$items.price' },
          maxPrice: { $max: '$items.price' }
        }
      },

      // Count bills for each product
      {
        $addFields: {
          billsCount: { $size: '$billsCount' }
        }
      },

      // Lookup category details
      {
        $lookup: {
          from: 'categories',
          localField: 'category',
          foreignField: '_id',
          as: 'categoryInfo'
        }
      },

      // Format the output
      {
        $project: {
          _id: 1,
          productName: 1,
          category: { $arrayElemAt: ['$categoryInfo.name', 0] },
          totalQuantity: 1,
          totalRevenue: { $round: ['$totalRevenue', 2] },
          averagePrice: { $round: ['$averagePrice', 2] },
          billsCount: 1,
          minPrice: { $round: ['$minPrice', 2] },
          maxPrice: { $round: ['$maxPrice', 2] }
        }
      }
    ];

    // Add sorting
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;
    pipeline.push({ $sort: sortObj });

    // Execute aggregation
    const sellingData = await Bill.aggregate(pipeline);

    // Get summary statistics
    const summaryStats = await Bill.aggregate([
      { $match: matchConditions },
      {
        $group: {
          _id: null,
          totalBills: { $addToSet: '$_id' },
          totalRevenue: { $sum: '$totalAmount' },
          totalItems: { $sum: { $size: '$items' } }
        }
      },
      {
        $project: {
          _id: 0,
          totalBills: { $size: '$totalBills' },
          totalRevenue: { $round: ['$totalRevenue', 2] },
          totalItems: 1
        }
      }
    ]);

    const stats = summaryStats[0] || { totalBills: 0, totalRevenue: 0, totalItems: 0 };

    res.status(200).json({
      products: sellingData,
      summary: stats,
      filters: {
        startDate,
        endDate,
        productId,
        categoryId
      }
    });

  } catch (err) {
    console.error("Error in getSellingReport:", err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.getProductSellingDetails = async (req, res) => {
  try {
    const { productId } = req.params;
    const { startDate, endDate, limit = 50 } = req.query;

    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: 'Valid product ID is required' });
    }

    // Build match conditions
    let matchConditions = {
      'items.productId': productId
    };

    // Date range filter
    if (startDate && endDate) {
      matchConditions.billDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Get product details
    const product = await Product.findById(productId).populate('category', 'name');
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Get sales data with bill details
    const salesPipeline = [
      { $match: matchConditions },
      { $unwind: '$items' },
      { $match: { 'items.productId': new mongoose.Types.ObjectId(productId) } },
      {
        $lookup: {
          from: 'customers',
          localField: 'customerId',
          foreignField: '_id',
          as: 'customer'
        }
      },
      { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          billNumber: 1,
          billDate: 1,
          customerName: { $ifNull: ['$customer.name', '$customerName'] },
          quantity: '$items.quantity',
          price: '$items.price',
          total: '$items.total',
          paymentStatus: 1,
          paymentMethod: 1
        }
      },
      { $sort: { billDate: -1 } },
      { $limit: parseInt(limit) }
    ];

    const salesHistory = await Bill.aggregate(salesPipeline);

    // Calculate metrics
    const metrics = await Bill.aggregate([
      { $match: matchConditions },
      { $unwind: '$items' },
      { $match: { 'items.productId': new mongoose.Types.ObjectId(productId) } },
      {
        $group: {
          _id: null,
          totalQuantity: { $sum: '$items.quantity' },
          totalRevenue: { $sum: '$items.total' },
          averagePrice: { $avg: '$items.price' },
          billsCount: { $addToSet: '$_id' },
          minPrice: { $min: '$items.price' },
          maxPrice: { $max: '$items.price' },
          firstSaleDate: { $min: '$billDate' },
          lastSaleDate: { $max: '$billDate' }
        }
      },
      {
        $project: {
          _id: 0,
          totalQuantity: 1,
          totalRevenue: { $round: ['$totalRevenue', 2] },
          averagePrice: { $round: ['$averagePrice', 2] },
          billsCount: { $size: '$billsCount' },
          minPrice: { $round: ['$minPrice', 2] },
          maxPrice: { $round: ['$maxPrice', 2] },
          firstSaleDate: 1,
          lastSaleDate: 1
        }
      }
    ]);

    // Get daily sales trend (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const trendPipeline = [
      {
        $match: {
          'items.productId': new mongoose.Types.ObjectId(productId),
          billDate: { $gte: thirtyDaysAgo }
        }
      },
      { $unwind: '$items' },
      { $match: { 'items.productId': new mongoose.Types.ObjectId(productId) } },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$billDate' }
          },
          quantity: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.total' },
          billsCount: { $addToSet: '$_id' }
        }
      },
      {
        $project: {
          _id: 0,
          date: '$_id',
          quantity: 1,
          revenue: { $round: ['$revenue', 2] },
          billsCount: { $size: '$billsCount' }
        }
      },
      { $sort: { date: 1 } }
    ];

    const salesTrend = await Bill.aggregate(trendPipeline);

    const result = {
      product: {
        _id: product._id,
        name: product.name,
        category: product.category?.name || 'Uncategorized',
        currentStock: product.quantity,
        unit: product.unit,
        basePrice: product.price
      },
      metrics: metrics[0] || {
        totalQuantity: 0,
        totalRevenue: 0,
        averagePrice: 0,
        billsCount: 0,
        minPrice: 0,
        maxPrice: 0
      },
      salesHistory,
      salesTrend
    };

    res.status(200).json(result);

  } catch (err) {
    console.error("Error in getProductSellingDetails:", err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// @desc    Get monthly selling report for products
// @route   GET /api/bills/monthly-selling-report
// @access  Private/Admin
exports.getMonthlySellingReport = async (req, res) => {
  try {
    const { startDate, endDate, productId, limit = 12 } = req.query;

    // Build match conditions
    let matchConditions = {};

    // Date range filter
    if (startDate && endDate) {
      matchConditions.billDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Product filter
    if (productId && productId !== 'all') {
      if (!mongoose.Types.ObjectId.isValid(productId)) {
        return res.status(400).json({ message: 'Invalid product ID' });
      }
      matchConditions['items.productId'] = productId;
    }

    // Aggregation pipeline for monthly data
    const monthlyPipeline = [
      { $match: matchConditions },
      { $unwind: '$items' },

      // Apply product filter if specified
      ...(productId && productId !== 'all' ? [{ $match: { 'items.productId': new mongoose.Types.ObjectId(productId) } }] : []),

      // Group by month and product
      {
        $group: {
          _id: {
            year: { $year: '$billDate' },
            month: { $month: '$billDate' },
            productId: '$items.productId'
          },
          productName: { $first: '$items.name' },
          totalQuantity: { $sum: '$items.quantity' },
          totalRevenue: { $sum: '$items.total' },
          billsCount: { $addToSet: '$_id' },
          averagePrice: { $avg: '$items.price' }
        }
      },

      // Count bills
      {
        $addFields: {
          billsCount: { $size: '$billsCount' }
        }
      },

      // Lookup product details
      {
        $lookup: {
          from: 'products',
          localField: '_id.productId',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },

      // Lookup category
      {
        $lookup: {
          from: 'categories',
          localField: 'product.category',
          foreignField: '_id',
          as: 'category'
        }
      },

      // Format the output
      {
        $project: {
          _id: 0,
          year: '$_id.year',
          month: '$_id.month',
          monthName: {
            $arrayElemAt: [
              ['', 'January', 'February', 'March', 'April', 'May', 'June',
               'July', 'August', 'September', 'October', 'November', 'December'],
              '$_id.month'
            ]
          },
          productId: '$_id.productId',
          productName: 1,
          category: { $arrayElemAt: ['$category.name', 0] },
          totalQuantity: 1,
          totalRevenue: { $round: ['$totalRevenue', 2] },
          billsCount: 1,
          averagePrice: { $round: ['$averagePrice', 2] }
        }
      },

      // Sort by year and month descending
      { $sort: { year: -1, month: -1 } },

      // Limit results
      { $limit: parseInt(limit) }
    ];

    const monthlyData = await Bill.aggregate(monthlyPipeline);

    // Get summary statistics
    const summaryPipeline = [
      { $match: matchConditions },
      { $unwind: '$items' },
      ...(productId && productId !== 'all' ? [{ $match: { 'items.productId': new mongoose.Types.ObjectId(productId) } }] : []),
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$items.total' },
          totalQuantity: { $sum: '$items.quantity' },
          totalBills: { $addToSet: '$_id' },
          monthsCount: {
            $addToSet: {
              year: { $year: '$billDate' },
              month: { $month: '$billDate' }
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          totalRevenue: { $round: ['$totalRevenue', 2] },
          totalQuantity: 1,
          totalBills: { $size: '$totalBills' },
          monthsCount: { $size: '$monthsCount' }
        }
      }
    ];

    const summaryData = await Bill.aggregate(summaryPipeline);
    const summary = summaryData[0] || { totalRevenue: 0, totalQuantity: 0, totalBills: 0, monthsCount: 0 };

    res.status(200).json({
      monthlyData,
      summary,
      filters: {
        startDate,
        endDate,
        productId
      }
    });

  } catch (err) {
    console.error("Error in getMonthlySellingReport:", err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
