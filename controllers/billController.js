// controllers/billController.js
const mongoose = require('mongoose');
const Bill = require('../models/Bill');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
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

      const product = await Product.findById(item.productId);
      if (!product) {
        throw httpError(400, `Item ${index + 1}: Invalid product selected.`);
      }

      if (product.quantity < quantity) {
        throw httpError(400, `Item ${index + 1}: Only ${product.quantity} units available for '${product.name}'.`);
      }

      product.quantity -= quantity;
      await product.save({ validateModifiedOnly: true });
      updatedProducts.set(String(product._id), product);

      items.push({
        productId: product._id,
        name: item.name || product.name,
        quantity,
        price,
        total
      });
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
