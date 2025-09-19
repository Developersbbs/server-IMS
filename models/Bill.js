// models/Bill.js
const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  total: {
    type: Number,
    required: true
  }
});

const billSchema = new mongoose.Schema({
  billNumber: {
    type: String,
    // required: true, // Moved to post-validation setup
    unique: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  customerName: {
    type: String,
    required: true
  },
  customerEmail: {
    type: String,
    required: true
  },
  customerPhone: {
    type: String,
    required: true
  },
  items: [itemSchema],
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  taxAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  discount: {
    type: Number,
    default: 0,
    min: 0
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'partial'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'upi', 'bank_transfer', 'credit'],
    default: 'cash'
  },
  paidAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  dueAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  billDate: {
    type: Date,
    default: Date.now
  },
  dueDate: {
    type: Date
  },
  notes: {
    type: String,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// --- IMPROVED Generate bill number hook ---
billSchema.pre('validate', async function(next) {
  // Only generate billNumber if it's a new document and billNumber is not already set
  if (this.isNew && !this.billNumber) {
    try {
      // Find the highest existing bill number and increment
      // Using `sort` and `limit` is generally more reliable than `countDocuments`
      // especially if documents can be deleted.
      const lastBill = await this.constructor // Use this.constructor instead of mongoose.model('Bill')
        .findOne({}, { billNumber: 1 })
        .sort({ createdAt: -1 }) // Sort by creation date descending
        .limit(1)
        .exec();

      let nextNumber = 1;
      if (lastBill && lastBill.billNumber) {
        // Extract the number part from the last bill number (e.g., "000012" from "BILL-000012")
        const lastNumberString = lastBill.billNumber.split('-')[1];
        const lastNumber = parseInt(lastNumberString, 10);
        if (!isNaN(lastNumber)) {
          nextNumber = lastNumber + 1;
        }
      }

      this.billNumber = `BILL-${String(nextNumber).padStart(6, '0')}`;
      // console.log(`Generated billNumber for new bill: ${this.billNumber}`); // Optional: for debugging
    } catch (err) {
      // If there's an error generating the bill number, pass it to the next middleware
      // This will prevent saving the document and report the error
      console.error("Error generating bill number:", err); // Log the specific error
      return next(err);
    }
  }
  next();
});

// Re-add the required validator *after* the pre-validate hook
// This ensures validation runs, but only after the hook has had a chance to populate billNumber
billSchema.path('billNumber').required(true, 'Bill number is required');

module.exports = mongoose.model('Bill', billSchema);
