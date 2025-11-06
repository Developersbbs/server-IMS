const mongoose = require('mongoose');
require('dotenv').config();

/**
 * Quick Check and Fix for Batch Issues
 * This script checks Clock product and fixes it immediately
 */

async function checkAndFixBatches() {
  try {
    console.log('🔍 Checking Clock product batches...\n');
    
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    
    if (!mongoUri) {
      console.error('❌ MONGO_URI or MONGODB_URI not found in .env file');
      console.log('\n💡 Make sure you have a .env file in server-IMS folder with:');
      console.log('   MONGO_URI=your_mongodb_connection_string\n');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    const Product = require('./models/Product');
    const ProductBatch = require('./models/ProductBatch');

    // Find Clock product
    const clock = await Product.findOne({ name: /clock/i });
    
    if (!clock) {
      console.log('❌ No product found matching "Clock"');
      console.log('💡 Available products:');
      const allProducts = await Product.find({}).limit(10);
      allProducts.forEach(p => console.log(`   - ${p.name} (Qty: ${p.quantity})`));
      process.exit(1);
    }

    console.log('📦 Product Found:');
    console.log(`   Name: ${clock.name}`);
    console.log(`   Quantity: ${clock.quantity}`);
    console.log(`   Price: ₹${clock.price}\n`);

    // Check existing batches
    const batches = await ProductBatch.find({ product: clock._id });
    const availableBatches = batches.filter(b => b.quantity > 0);
    const totalBatchQty = batches.reduce((sum, b) => sum + b.quantity, 0);

    console.log('📋 Existing Batches:');
    if (batches.length === 0) {
      console.log('   ⚠️  NO BATCHES FOUND!\n');
    } else {
      batches.forEach((batch, i) => {
        console.log(`   Batch ${i + 1}: ${batch.batchNumber}`);
        console.log(`      Quantity: ${batch.quantity}`);
        console.log(`      Unit Cost: ₹${batch.unitCost}`);
        console.log(`      Date: ${batch.receivedDate?.toLocaleDateString() || 'N/A'}\n`);
      });
    }

    console.log('📊 Analysis:');
    console.log(`   Product Quantity: ${clock.quantity}`);
    console.log(`   Total Batch Quantity: ${totalBatchQty}`);
    console.log(`   Available Batches: ${availableBatches.length}`);
    console.log(`   Difference: ${clock.quantity - totalBatchQty}\n`);

    // Fix if needed
    if (clock.quantity > 0 && totalBatchQty < clock.quantity) {
      console.log('🔧 FIXING: Creating batch for missing quantity...\n');
      
      const missingQty = clock.quantity - totalBatchQty;
      const newBatch = new ProductBatch({
        product: clock._id,
        batchNumber: `FIX-${clock.sku || 'CLK'}-${Date.now()}`,
        quantity: missingQty,
        unitCost: clock.price || 0,
        receivedDate: new Date(),
        manufacturingDate: new Date(),
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        notes: 'Auto-created to fix batch shortage'
      });

      await newBatch.save();
      
      console.log('✅ FIXED! Created new batch:');
      console.log(`   Batch Number: ${newBatch.batchNumber}`);
      console.log(`   Quantity: ${newBatch.quantity}`);
      console.log(`   Unit Cost: ₹${newBatch.unitCost}\n`);
      
      console.log('🎉 You can now create bills for Clock product!\n');
    } else if (clock.quantity === 0) {
      console.log('⚠️  Product has 0 quantity - add stock via Inward Entry first\n');
    } else {
      console.log('✅ Batches are already synced correctly!\n');
    }

    // Show all products that need fixing
    console.log('🔍 Checking ALL products for batch issues...\n');
    const allProducts = await Product.find({ quantity: { $gt: 0 } });
    let needsFixCount = 0;

    for (const product of allProducts) {
      const productBatches = await ProductBatch.find({ product: product._id });
      const productBatchTotal = productBatches.reduce((sum, b) => sum + b.quantity, 0);
      
      if (productBatchTotal < product.quantity) {
        console.log(`⚠️  ${product.name}: Missing ${product.quantity - productBatchTotal} units in batches`);
        needsFixCount++;
      }
    }

    if (needsFixCount > 0) {
      console.log(`\n⚠️  Found ${needsFixCount} products with batch issues`);
      console.log('💡 Run this to fix ALL products:');
      console.log('   node sync-product-batches.js\n');
    } else {
      console.log('\n✅ All products have correct batches!\n');
    }

    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

checkAndFixBatches();
