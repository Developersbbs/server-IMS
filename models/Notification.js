const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  message: { type: String, required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  type: { type: String, enum: ['low-stock', 'out-of-stock'], required: true },
  isRead: { type: Boolean, default: false },
  readAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
