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
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.createBill = async (req, res) => {
  try {
    const billData = req.body;
    billData.createdBy = req.user._id;
    
    // Calculate totals
    billData.subtotal = billData.items.reduce((sum, item) => sum + item.total, 0);
    billData.totalAmount = billData.subtotal + (billData.taxAmount || 0) - (billData.discount || 0);
    billData.dueAmount = billData.totalAmount - (billData.paidAmount || 0);
    
    const bill = new Bill(billData);
    await bill.save();
    
    // Update customer outstanding balance if credit
    if (billData.paymentMethod === 'credit') {
      await Customer.findByIdAndUpdate(
        billData.customerId,
        { $inc: { outstandingBalance: billData.dueAmount } }
      );
    }
    
    res.status(201).json({ 
      message: 'Bill created successfully',
      bill 
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.updateBill = async (req, res) => {
  try {
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
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};