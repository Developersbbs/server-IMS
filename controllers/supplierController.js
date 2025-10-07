// controllers/supplierController.js
const Supplier = require('../models/Supplier');
const Product = require('../models/Product');

// Get all suppliers
exports.getAllSuppliers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status } = req.query;
    
    // Build filter object
    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { contactPerson: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    if (status) {
      filter.status = status;
    }
    
    const suppliers = await Supplier.find(filter)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });
    
    const total = await Supplier.countDocuments(filter);
    
    res.status(200).json({
      suppliers,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get supplier by ID
exports.getSupplierById = async (req, res) => {
  try {
    const { id } = req.params;
    const supplier = await Supplier.findById(id);
    
    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }
    
    res.status(200).json(supplier);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Create new supplier
exports.createSupplier = async (req, res) => {
  try {
    const supplierData = req.body;
    
    // Check if supplier with email already exists
    const existingSupplier = await Supplier.findOne({ email: supplierData.email });
    if (existingSupplier) {
      return res.status(400).json({ message: 'Supplier with this email already exists' });
    }
    
    const supplier = new Supplier(supplierData);
    await supplier.save();
    
    res.status(201).json({ 
      message: 'Supplier created successfully',
      supplier 
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Supplier with this email already exists' });
    }
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Update supplier
exports.updateSupplier = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // If email is being updated, check if it's already taken by another supplier
    if (updates.email) {
      const existingSupplier = await Supplier.findOne({ 
        email: updates.email, 
        _id: { $ne: id } 
      });
      
      if (existingSupplier) {
        return res.status(400).json({ message: 'Supplier with this email already exists' });
      }
    }
    
    const supplier = await Supplier.findByIdAndUpdate(
      id, 
      updates, 
      { new: true, runValidators: true }
    );
    
    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }
    
    res.status(200).json({ 
      message: 'Supplier updated successfully', 
      supplier 
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Supplier with this email already exists' });
    }
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Delete supplier
exports.deleteSupplier = async (req, res) => {
  try {
    const { id } = req.params;
    
    const supplier = await Supplier.findByIdAndDelete(id);
    
    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }
    
    res.status(200).json({ message: 'Supplier deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get supplier statistics
exports.getSuppliersStats = async (req, res) => {
  try {
    const stats = await Supplier.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const result = {
      total: 0,
      active: 0,
      inactive: 0,
      pending: 0
    };

    stats.forEach(stat => {
      result[stat._id] = stat.count;
      result.total += stat.count;
    });

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get products for a supplier
exports.getSupplierProducts = async (req, res) => {
  try {
    const { id } = req.params;

    const products = await Product.find({ supplier: id })
      .select('_id name category price quantity batchNumber expiryDate')
      .sort({ name: 1 });

    res.status(200).json({ products });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};