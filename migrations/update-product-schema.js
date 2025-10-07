const mongoose = require('mongoose');
require('dotenv').config();
const Product = require('../models/Product');

async function updateProductSchema() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Get a default supplier ID (you'll need to replace this with a valid supplier ID)
    const defaultSupplier = await mongoose.connection.db.collection('suppliers').findOne();
    const defaultSupplierId = defaultSupplier ? defaultSupplier._id : null;

    if (!defaultSupplier) {
      console.warn('No suppliers found. Please create a supplier first.');
      process.exit(1);
    }

    // Add new fields to all products
    await Product.updateMany(
      {},
      [
        {
          $set: {
            supplier: defaultSupplierId,
            batchNumber: {
              $concat: [
                { $toString: { $year: '$createdAt' } },
                '-',
                { $toString: { $month: '$createdAt' } },
                '-',
                { $toString: { $dayOfMonth: '$createdAt' } },
                '-',
                { $substr: [{ $toString: '$_id' }, 0, 6] }
              ]
            },
            addedDate: '$createdAt',
            reorderLevel: 10,
            expiryDate: {
              $dateAdd: {
                startDate: '$createdAt',
                unit: 'year',
                amount: 2 // Default expiry 2 years from creation
              }
            }
          }
        }
      ]
    );

    console.log('Product schema updated successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error updating product schema:', error);
    process.exit(1);
  }
}

updateProductSchema();
