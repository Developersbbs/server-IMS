const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const User = require('./models/User');

async function createTestUser() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected');

    // Check if user already exists
    const existingUser = await User.findOne({ email: 'admin@test.com' });
    if (existingUser) {
      console.log('✅ Test user already exists');
      process.exit(0);
    }

    // Create test user
    const testUser = new User({
      username: 'admin',
      email: 'admin@test.com',
      password: 'admin123', // Will be hashed by pre-save hook
      role: 'superadmin',
      status: 'active'
    });

    await testUser.save();
    console.log('✅ Test user created successfully');
    console.log('   Email: admin@test.com');
    console.log('   Password: admin123');
    console.log('   Role: superadmin');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating test user:', error.message);
    process.exit(1);
  }
}

createTestUser();
