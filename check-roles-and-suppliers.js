const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User');
const Supplier = require('./models/Supplier');

async function checkUserRolesAndSuppliers() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('🔍 Checking User Roles and Suppliers');
    console.log('=' .repeat(50));

    // Check all users and their roles
    console.log('\n👤 Users and their roles:');
    const users = await User.find({}, 'username email role').sort({ createdAt: -1 });
    users.forEach((user, index) => {
      console.log(`   ${index + 1}. ${user.username} (${user.email}) - Role: ${user.role}`);
    });

    // Check suppliers
    console.log('\n📦 Available suppliers:');
    const suppliers = await Supplier.find({}, 'name email status').sort({ createdAt: -1 });
    if (suppliers.length === 0) {
      console.log('   ❌ No suppliers found in database');

      // Create sample suppliers for testing
      console.log('\n🔧 Creating sample suppliers...');
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
        },
        {
          name: 'Global Supplies Ltd',
          contactPerson: 'Sarah Johnson',
          email: 'sarah@globalsupplies.com',
          phone: '+1-555-0456',
          address: {
            street: '456 Business Ave',
            city: 'New York',
            state: 'NY',
            zipCode: '10001',
            country: 'USA'
          },
          products: ['Office Supplies'],
          status: 'active',
          paymentTerms: 'Net 15'
        }
      ];

      await Supplier.insertMany(sampleSuppliers);
      console.log('   ✅ Created sample suppliers');

      // Refresh suppliers list
      const newSuppliers = await Supplier.find({}, 'name email status').sort({ createdAt: -1 });
      newSuppliers.forEach((supplier, index) => {
        console.log(`   ${index + 1}. ${supplier.name} (${supplier.email}) - Status: ${supplier.status}`);
      });
    } else {
      suppliers.forEach((supplier, index) => {
        console.log(`   ${index + 1}. ${supplier.name} (${supplier.email}) - Status: ${supplier.status}`);
      });
    }

    console.log('\n📋 Role Requirements:');
    console.log('   • Supplier API requires: superadmin, stockmanager');
    console.log('   • Purchase API requires: superadmin, stockmanager (for some operations)');
    console.log('   • Default role: billcounter');

    console.log('\n⚠️  If suppliers are not showing in the purchase form:');
    console.log('   1. Check if user has superadmin or stockmanager role');
    console.log('   2. Check browser console for API errors');
    console.log('   3. Verify authentication token is valid');
    console.log('   4. Check if API endpoints are accessible');

    console.log('\n🔧 To fix role issues, update user role in database:');
    console.log('   - superadmin: Full access to all features');
    console.log('   - stockmanager: Can manage suppliers and purchases');
    console.log('   - billcounter: Limited to billing only');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkUserRolesAndSuppliers();
