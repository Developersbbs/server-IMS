const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User');

async function migrate() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Update all users that don't have a status field
    const result = await User.updateMany(
      { status: { $exists: false } },
      { $set: { status: 'active' } }
    );

    console.log(`Updated ${result.nModified} users with default status`);
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
