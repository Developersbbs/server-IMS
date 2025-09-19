// models/Customer.js
const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  gstNumber: {
    type: String,
    trim: true
  },
  customerType: {
    type: String,
    enum: ['individual', 'business'],
    default: 'individual'
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  creditLimit: {
    type: Number,
    default: 0
  },
  outstandingBalance: {
    type: Number,
    default: 0
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true,
  // Enable virtual fields and ensure they are serialized to JSON
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// --- Add Virtual Field for Billing History ---
// This creates a virtual 'bills' property on the Customer document
// It finds all Bill documents where the customerId matches this customer's _id
customerSchema.virtual('bills', {
  ref: 'Bill', // The model to use
  localField: '_id', // Find Bill where `customerId` (in Bill schema)
  foreignField: 'customerId', // is equal to `_id` (in Customer schema)
  // If you want only specific fields, you can add `select: 'billNumber totalAmount billDate'`
  // If you want the latest bills first, you can add `options: { sort: { billDate: -1 } }`
});

module.exports = mongoose.model('Customer', customerSchema);