// const mongoose = require('mongoose');
// const mongoosePaginate = require('mongoose-paginate-v2');

// const purchaseItemSchema = new mongoose.Schema({
//   product: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Product',
//     required: true
//   },
//   quantity: {
//     type: Number,
//     required: true,
//     min: 1
//   },
//   receivedQuantity: {
//     type: Number,
//     default: 0,
//     min: 0,
//     validate: {
//       validator: function(value) {
//         return value <= this.quantity;
//       },
//       message: 'Received quantity cannot exceed ordered quantity'
//     }
//   },
//   unitCost: {
//     type: Number,
//     required: true,
//     min: 0
//   },
//   total: {
//     type: Number,
//     required: true,
//     min: 0
//   }
// });

// const purchaseSchema = new mongoose.Schema({
//   purchaseOrderNumber: {
//     type: String,
//     required: true,
//     unique: true
//   },
//   supplier: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Supplier',
//     required: true
//   },
//   items: [purchaseItemSchema],
//   totalAmount: {
//     type: Number,
//     required: true,
//     min: 0
//   },
//   status: {
//     type: String,
//     enum: ['draft', 'pending', 'approved', 'rejected', 'partially_received', 'completed', 'cancelled'],
//     default: 'pending' // Changed from 'draft' to match controller expectations
//   },
//   orderDate: {
//     type: Date,
//     default: Date.now
//   },
//   expectedDeliveryDate: {
//     type: Date
//   },
//   actualDeliveryDate: {
//     type: Date
//   },
//   notes: {
//     type: String,
//     trim: true
//   },
//   createdBy: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User',
//     required: true
//   },
//   approvedBy: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User'
//   },
//   approvalDate: {
//     type: Date
//   },
//   // Additional tracking fields
//   receivedDate: {
//     type: Date
//   },
//   isFullyReceived: {
//     type: Boolean,
//     default: false
//   }
// }, {
//   timestamps: true
// });

// // Add pagination plugin
// purchaseSchema.plugin(mongoosePaginate);

// // Generate purchase order number before saving
// purchaseSchema.pre('save', async function(next) {
//   if (this.isNew && !this.purchaseOrderNumber) {
//     try {
//       const count = await mongoose.model('Purchase').countDocuments();
//       const today = new Date();
//       const year = today.getFullYear();
//       const month = String(today.getMonth() + 1).padStart(2, '0');
//       const day = String(today.getDate()).padStart(2, '0');
      
//       this.purchaseOrderNumber = `PO-${year}${month}${day}-${String(count + 1).padStart(4, '0')}`;
//     } catch (error) {
//       return next(error);
//     }
//   }
//   next();
// });

// // Calculate item totals and total amount before saving
// purchaseSchema.pre('save', function(next) {
//   if (this.isModified('items')) {
//     // Calculate individual item totals
//     this.items.forEach(item => {
//       item.total = item.quantity * item.unitCost;
//     });
    
//     // Calculate total amount
//     this.totalAmount = this.items.reduce((total, item) => total + item.total, 0);
    
//     // Check if fully received
//     this.isFullyReceived = this.items.every(item => 
//       item.receivedQuantity >= item.quantity
//     );
//   }
//   next();
// });

// // Update status based on received quantities
// purchaseSchema.pre('save', function(next) {
//   if (this.isModified('items') && this.status === 'approved' || this.status === 'partially_received' || this.status === 'completed') {
//     const hasReceivedItems = this.items.some(item => item.receivedQuantity > 0);
//     const allItemsReceived = this.items.every(item => item.receivedQuantity >= item.quantity);
    
//     if (allItemsReceived && hasReceivedItems) {
//       this.status = 'completed';
//       if (!this.actualDeliveryDate) {
//         this.actualDeliveryDate = new Date();
//       }
//     } else if (hasReceivedItems) {
//       this.status = 'partially_received';
//     }
//   }
//   next();
// });

// // Virtual for completion percentage
// purchaseSchema.virtual('completionPercentage').get(function() {
//   if (!this.items || this.items.length === 0) return 0;
  
//   const totalOrdered = this.items.reduce((sum, item) => sum + item.quantity, 0);
//   const totalReceived = this.items.reduce((sum, item) => sum + item.receivedQuantity, 0);
  
//   return totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;
// });

// // Virtual for pending items
// purchaseSchema.virtual('pendingItems').get(function() {
//   return this.items.filter(item => item.receivedQuantity < item.quantity);
// });

// // Instance method to check if purchase can be modified
// purchaseSchema.methods.canBeModified = function() {
//   return !['approved', 'completed', 'cancelled'].includes(this.status);
// };

// // Instance method to check if purchase can be approved
// purchaseSchema.methods.canBeApproved = function() {
//   return this.status === 'pending';
// };

// // Instance method to check if purchase can receive items
// purchaseSchema.methods.canReceiveItems = function() {
//   return ['approved', 'partially_received'].includes(this.status);
// };

// // Static method to get purchases by status
// purchaseSchema.statics.findByStatus = function(status, options = {}) {
//   return this.find({ status }, null, options);
// };

// // Static method to get overdue purchases
// purchaseSchema.statics.findOverdue = function() {
//   return this.find({
//     expectedDeliveryDate: { $lt: new Date() },
//     status: { $in: ['approved', 'partially_received'] }
//   });
// };

// // Index for better query performance
// purchaseSchema.index({ status: 1, createdAt: -1 });
// purchaseSchema.index({ supplier: 1, status: 1 });
// purchaseSchema.index({ purchaseOrderNumber: 1 });
// purchaseSchema.index({ expectedDeliveryDate: 1, status: 1 });

// // Ensure virtual fields are serialized
// purchaseSchema.set('toJSON', { virtuals: true });
// purchaseSchema.set('toObject', { virtuals: true });

// module.exports = mongoose.model('Purchase', purchaseSchema);