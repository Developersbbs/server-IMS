const mongoose = require('mongoose');
require('dotenv').config();
const Supplier = require('../models/Supplier');

async function updateSupplierSchema() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Update all suppliers to include required address fields if they don't exist
    await Supplier.updateMany(
      {},
      {
        $set: {
          'address.street': 'Not specified',
          'address.city': 'Not specified',
          'address.state': 'Not specified',
          'address.zipCode': '000000',
          'address.country': 'India',
          taxId: '',
          website: '',
          rating: 5,
          leadTime: 7
        },
        $setOnInsert: { 
          paymentTerms: 'Net 30',
          status: 'active'
        }
      },
      { upsert: false, multi: true }
    );

    // Update paymentTerms to use enum values
    await Supplier.updateMany(
      { paymentTerms: { $exists: true } },
      [
        {
          $set: {
            paymentTerms: {
              $switch: {
                branches: [
                  { case: { $eq: ['$paymentTerms', 'Net 7'] }, then: 'Net 7' },
                  { case: { $eq: ['$paymentTerms', 'Net 15'] }, then: 'Net 15' },
                  { case: { $eq: ['$paymentTerms', 'Net 30'] }, then: 'Net 30' },
                  { case: { $eq: ['$paymentTerms', 'Net 60'] }, then: 'Net 60' },
                  { case: { $eq: ['$paymentTerms', 'Due on Receipt'] }, then: 'Due on Receipt' }
                ],
                default: 'Net 30'
              }
            }
          }
        }
      ]
    );

    console.log('Supplier schema updated successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error updating supplier schema:', error);
    process.exit(1);
  }
}

updateSupplierSchema();
