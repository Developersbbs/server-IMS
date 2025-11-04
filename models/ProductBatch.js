const mongoose = require('mongoose');

const productBatchSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true
  },
  batchNumber: {
    type: String,
    required: true,
    trim: true
  },
  unitCost: {
    type: Number,
    required: true,
    min: 0
  },
  quantity: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  manufacturingDate: {
    type: Date
  },
  expiryDate: {
    type: Date
  },
  receivedDate: {
    type: Date,
    default: Date.now
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier'
  }
}, { timestamps: true });

// Ensure each product+batchNumber is unique
productBatchSchema.index({ product: 1, batchNumber: 1 }, { unique: true });

module.exports = mongoose.model('ProductBatch', productBatchSchema, 'product_batches');
