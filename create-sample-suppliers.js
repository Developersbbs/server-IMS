const mongoose = require('mongoose');
require('dotenv').config();
const Supplier = require('./models/Supplier');

async function createSampleSuppliers() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Sample suppliers data
    const sampleSuppliers = [
      {
        name: 'TechCorp Electronics',
        contactPerson: 'John Smith',
        email: 'john@techcorp.com',
        phone: '+1-555-0123',
        address: {
          street: '123 Tech Street',
          city: 'San Francisco',
          state: 'CA',
          zipCode: '94105',
          country: 'USA'
        },
        products: ['Laptops', 'Smartphones', 'Tablets'],
        status: 'active',
        paymentTerms: 'Net 30',
        notes: 'Premium electronics supplier'
      },
      {
        name: 'Global Office Supplies',
        contactPerson: 'Sarah Johnson',
        email: 'sarah@globaloffice.com',
        phone: '+1-555-0456',
        address: {
          street: '456 Business Ave',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'USA'
        },
        products: ['Paper', 'Pens', 'Furniture', 'Stationery'],
        status: 'active',
        paymentTerms: 'Net 15',
        notes: 'Office supplies and furniture'
      },
      {
        name: 'Fresh Foods Ltd',
        contactPerson: 'Mike Wilson',
        email: 'mike@freshfoods.com',
        phone: '+1-555-0789',
        address: {
          street: '789 Market Road',
          city: 'Los Angeles',
          state: 'CA',
          zipCode: '90210',
          country: 'USA'
        },
        products: ['Fruits', 'Vegetables', 'Dairy', 'Beverages'],
        status: 'active',
        paymentTerms: 'Net 7',
        notes: 'Fresh produce and groceries'
      },
      {
        name: 'Industrial Parts Inc',
        contactPerson: 'David Brown',
        email: 'david@industrialparts.com',
        phone: '+1-555-0321',
        address: {
          street: '321 Industrial Blvd',
          city: 'Chicago',
          state: 'IL',
          zipCode: '60601',
          country: 'USA'
        },
        products: ['Machinery Parts', 'Tools', 'Equipment'],
        status: 'active',
        paymentTerms: 'Net 60',
        notes: 'Industrial machinery and parts'
      }
    ];

    // Check if suppliers already exist
    const existingCount = await Supplier.countDocuments();
    if (existingCount > 0) {
      console.log(`Found ${existingCount} existing suppliers. Skipping sample data creation.`);
      process.exit(0);
    }

    // Insert sample suppliers
    const createdSuppliers = await Supplier.insertMany(sampleSuppliers);
    console.log(`✅ Created ${createdSuppliers.length} sample suppliers:`);
    createdSuppliers.forEach((supplier, index) => {
      console.log(`   ${index + 1}. ${supplier.name} (${supplier.email})`);
    });

    console.log('\n🎉 Sample suppliers created successfully!');
    console.log('You can now test the purchase order system with supplier selection.');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating sample suppliers:', error);
    process.exit(1);
  }
}

createSampleSuppliers();
