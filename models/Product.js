const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  productId: {
    type: String,
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  image: {
    type: String,
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true
  },
  batchNumber: {
    type: String,
    required: true,
    trim: true
  },
  addedDate: {
    type: Date,
    default: Date.now
  },
  manufacturingDate: {
    type: Date,
    required: true
  },
  reorderLevel: {
    type: Number,
    default: 10,
    min: 1
  }
}, { timestamps: true });

// Add indexes for better query performance
productSchema.index({ name: 1 });
productSchema.index({ category: 1 });
productSchema.index({ price: 1 });
productSchema.index({ quantity: 1 });

// Add a virtual for stock status
productSchema.virtual('stockStatus').get(function() {
  if (this.quantity === 0) return 'out_of_stock';
  if (this.quantity <= 10) return 'low_stock';
  return 'in_stock';
});

// Ensure virtual fields are included in JSON output
productSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Product', productSchema, 'products');
