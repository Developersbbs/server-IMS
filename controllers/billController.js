// controllers/billController.js
const Bill = require('../models/Bill');
const Customer = require('../models/Customer');
const Product = require('../models/Product');

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
  let session;
  try {
    const billData = { ...req.body }; // Create a copy to avoid modifying req.body directly
    billData.createdBy = req.user._id; // Assuming req.user is populated by auth middleware

    // --- FIX 1: Fetch Customer Details ---
    if (!billData.customerId) {
       return res.status(400).json({ message: 'Customer ID is required.' });
    }
    const customer = await Customer.findById(billData.customerId);
    if (!customer) {
       return res.status(400).json({ message: 'Invalid Customer ID provided.' });
    }
    billData.customerName = customer.name;
    billData.customerEmail = customer.email;
    billData.customerPhone = customer.phone || ''; // Handle potential missing phone

    // --- FIX 2: Align Payment Method ---
    // Convert frontend 'bank' value to schema 'bank_transfer'
    if (billData.paymentMethod === 'bank') {
        billData.paymentMethod = 'bank_transfer';
    }
    // Validate paymentMethod against schema enum
    const validPaymentMethods = ['cash', 'card', 'upi', 'bank_transfer', 'credit'];
    if (!validPaymentMethods.includes(billData.paymentMethod)) {
         return res.status(400).json({ message: `Invalid payment method '${billData.paymentMethod}' provided.` });
    }

    // --- Validate Items ---
    if (!billData.items || !Array.isArray(billData.items) || billData.items.length === 0) {
        return res.status(400).json({ message: 'Bill must contain at least one item.' });
    }
    // Validate individual item fields
    for (let i = 0; i < billData.items.length; i++) {
        const item = billData.items[i];
        if (!item.productId) {
             return res.status(400).json({ message: `Item ${i + 1}: Product ID is required.` });
        }
        if (typeof item.quantity !== 'number' || item.quantity <= 0) {
             return res.status(400).json({ message: `Item ${i + 1}: Quantity must be a number greater than 0.` });
        }
        if (typeof item.price !== 'number' || item.price < 0) {
             return res.status(400).json({ message: `Item ${i + 1}: Price must be a non-negative number.` });
        }
        if (typeof item.total !== 'number' || item.total < 0) {
             return res.status(400).json({ message: `Item ${i + 1}: Total must be a non-negative number.` });
        }
        // Optional: Fetch product to verify details (name, price consistency) if needed
        // const product = await Product.findById(item.productId);
        // if (!product) {
        //    return res.status(400).json({ message: `Item ${i + 1}: Invalid Product ID.` });
        // }
        // billData.items[i].name = product.name; // Ensure name matches product
    }

    // --- Calculate Totals (Sanitize inputs) ---
    billData.subtotal = parseFloat((billData.items.reduce((sum, item) => sum + (item.total || 0), 0)).toFixed(2));
    billData.taxAmount = parseFloat((billData.taxAmount || 0).toFixed(2));
    billData.discount = parseFloat((billData.discount || 0).toFixed(2));
    billData.totalAmount = parseFloat((billData.subtotal + billData.taxAmount - billData.discount).toFixed(2));
    billData.paidAmount = parseFloat((billData.paidAmount || 0).toFixed(2));
    billData.dueAmount = parseFloat((billData.totalAmount - billData.paidAmount).toFixed(2));

    // Basic validation of calculated amounts
    if (billData.subtotal < 0) {
        return res.status(400).json({ message: 'Subtotal cannot be negative.' });
    }
    if (billData.totalAmount < 0) {
        return res.status(400).json({ message: 'Total amount cannot be negative.' });
    }
    if (billData.dueAmount < 0) {
         return res.status(400).json({ message: 'Due amount cannot be negative.' });
    }

    // --- Create the Bill ---
    // Mongoose will trigger the pre('validate') hook to generate billNumber
    const bill = new Bill(billData);
    await bill.save();

    // --- Update customer outstanding balance if applicable ---
    // Example logic: If payment is pending or partial, or method is credit, update balance.
    // Adjust this logic based on your specific business rules.
    if (bill.paymentMethod === 'credit' || (bill.paymentStatus === 'pending' && bill.dueAmount > 0) || bill.paymentStatus === 'partial') {
      await Customer.findByIdAndUpdate(
        bill.customerId,
        { $inc: { outstandingBalance: bill.dueAmount } },
        { new: true, runValidators: true } // Options for findByIdAndUpdate
      );
    }

    // Populate customerId for the response if needed by frontend
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
    // Consider similar validation and data fetching as in createBill if needed for updates
    // Be careful with updates that might affect financial calculations or customer balances.
    const bill = await Bill.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }
    
    res.status(200).json({ 
      message: 'Bill updated successfully', 
      bill 
    });
  } catch (err) {
    console.error("Error in updateBill:", err); // Log for debugging
    // Add specific error handling like in createBill if necessary
    if (err.name === 'ValidationError') {
        const messages = Object.values(err.errors).map(e => e.message);
        return res.status(400).json({ message: 'Validation Error', errors: messages }); // Use 'errors' array
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
