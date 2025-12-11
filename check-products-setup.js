const mongoose = require('mongoose');
require('dotenv').config();
const Product = require('./models/Product');
const Category = require('./models/Category');
const Supplier = require('./models/Supplier');

async function checkProductsAndCreateSamples() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('🔍 Checking Products in Database');
    console.log('=' .repeat(50));

    // Check products
    console.log('\n📦 Current products:');
    const productCount = await Product.countDocuments();
    console.log(`   Found ${productCount} products in database`);

    if (productCount === 0) {
      console.log('   ❌ No products found. Creating sample products...');

      // First check if categories exist
      const categoryCount = await Category.countDocuments();
      console.log(`   Found ${categoryCount} categories`);

      if (categoryCount === 0) {
        console.log('   Creating sample categories first...');
        const sampleCategories = [
          { name: 'Electronics', status: 'active' },
          { name: 'Clothing', status: 'active' },
          { name: 'Food & Beverages', status: 'active' },
          { name: 'Home & Garden', status: 'active' }
        ];
        await Category.insertMany(sampleCategories);
        console.log('   ✅ Created sample categories');
      }

      // Check suppliers
      const supplierCount = await Supplier.countDocuments();
      console.log(`   Found ${supplierCount} suppliers`);

      if (supplierCount === 0) {
        console.log('   Creating sample suppliers first...');
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
            products: ['Electronics'],
            status: 'active',
            paymentTerms: 'Net 30'
          }
        ];
        await Supplier.insertMany(sampleSuppliers);
        console.log('   ✅ Created sample suppliers');
      }

      // Get a category and supplier for products
      const category = await Category.findOne({ status: 'active' });
      const supplier = await Supplier.findOne({ status: 'active' });

      if (category && supplier) {
        console.log('   Creating sample products...');
        const sampleProducts = [
          {
            name: 'Wireless Bluetooth Headphones',
            description: 'High-quality wireless headphones with noise cancellation',
            price: 199.99,
            quantity: 50,
            category: category._id,
            supplier: supplier._id,
            batchNumber: 'WBH-2024-001',
            manufacturingDate: new Date('2024-01-15'),
            reorderLevel: 10,
            unit: 'pieces',
            hsnNumber: '85183000'
          },
          {
            name: 'Organic Green Tea',
            description: 'Premium organic green tea leaves, 100g pack',
            price: 15.99,
            quantity: 100,
            category: category._id,
            supplier: supplier._id,
            batchNumber: 'OGT-2024-002',
            manufacturingDate: new Date('2024-02-01'),
            reorderLevel: 20,
            unit: 'packs',
            hsnNumber: '09022090'
          },
          {
            name: 'Cotton T-Shirt',
            description: 'Comfortable 100% cotton t-shirt, medium size',
            price: 25.99,
            quantity: 75,
            category: category._id,
            supplier: supplier._id,
            batchNumber: 'CTS-2024-003',
            manufacturingDate: new Date('2024-01-20'),
            reorderLevel: 15,
            unit: 'pieces',
            hsnNumber: '61091000'
          }
        ];

        await Product.insertMany(sampleProducts);
        console.log('   ✅ Created sample products');

        // Refresh product count
        const newProductCount = await Product.countDocuments();
        console.log(`   📊 Total products now: ${newProductCount}`);
      } else {
        console.log('   ❌ Need at least one category and supplier to create products');
      }
    } else {
      console.log('   📋 Existing products:');
      const products = await Product.find({}, 'name price quantity category supplier')
        .populate('category', 'name')
        .populate('supplier', 'name')
        .limit(5);

      products.forEach((product, index) => {
        console.log(`   ${index + 1}. ${product.name} - ₹${product.price} (${product.quantity} in stock)`);
        console.log(`      Category: ${product.category?.name || 'N/A'}, Supplier: ${product.supplier?.name || 'N/A'}`);
      });
    }

    console.log('\n📋 API Requirements:');
    console.log('   • Products API requires authentication (protect middleware)');
    console.log('   • GET /api/products: Requires login token');
    console.log('   • POST/PUT/DELETE: Requires superadmin or stockmanager role');

    console.log('\n⚠️  If products are not showing in forms:');
    console.log('   1. Check if user is logged in (authentication token)');
    console.log('   2. Check browser console for API errors');
    console.log('   3. Verify products exist in database');
    console.log('   4. Check Redux state in browser dev tools');

    console.log('\n🔧 Debug information will be logged to browser console:');
    console.log('   • "🔄 Redux fetchProducts: Starting fetch..."');
    console.log('   • "🔄 Redux fetchProducts: Token available: true/false"');
    console.log('   • "🔄 Redux fetchProducts: Response received: {...}"');
    console.log('   • Form components will log received products');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkProductsAndCreateSamples();
