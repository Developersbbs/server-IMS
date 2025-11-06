const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

/**
 * PERMANENT SOLUTION: Sync Product Batches
 * 
 * This script creates ProductBatch records for all products that have quantity > 0
 * but are missing batch records. This enables the FIFO billing system to work properly.
 * 
 * The billing system will automatically:
 * - Use oldest batches first (FIFO)
 * - Handle multiple batches with different prices
 * - Deduct from batches automatically
 * 
 * Run this script whenever you have products with quantity but no batches.
 */

async function syncProductBatches() {
  try {
    console.log('🔄 Starting Product Batch Sync...\n');
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const Product = require('./models/Product');
    const ProductBatch = require('./models/ProductBatch');

    // Find all products with quantity > 0
    const products = await Product.find({ quantity: { $gt: 0 } });
    console.log(`📦 Found ${products.length} products with quantity > 0\n`);

    let syncedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const product of products) {
      try {
        // Check if product already has batches with available quantity
        const existingBatches = await ProductBatch.find({ 
          product: product._id,
          quantity: { $gt: 0 }
        });

        const totalBatchQty = existingBatches.reduce((sum, b) => sum + b.quantity, 0);

        // If total batch quantity matches product quantity, skip
        if (totalBatchQty === product.quantity) {
          console.log(`✓ ${product.name}: Already synced (${totalBatchQty} units in batches)`);
          skippedCount++;
          continue;
        }

        // If batches exist but don't match, show warning
        if (existingBatches.length > 0 && totalBatchQty !== product.quantity) {
          console.log(`⚠️  ${product.name}: Mismatch detected`);
          console.log(`   Product quantity: ${product.quantity}`);
          console.log(`   Batch total: ${totalBatchQty}`);
          console.log(`   Difference: ${product.quantity - totalBatchQty}`);
          
          // Create batch for the difference
          const difference = product.quantity - totalBatchQty;
          if (difference > 0) {
            const newBatch = new ProductBatch({
              product: product._id,
              batchNumber: `SYNC-${product.sku || product._id.toString().slice(-6)}-${Date.now()}`,
              quantity: difference,
              unitCost: product.price || 0,
              receivedDate: new Date(),
              manufacturingDate: new Date(),
              expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
              supplier: null,
              notes: 'Auto-synced batch to match product quantity'
            });
            
            await newBatch.save();
            console.log(`   ✅ Created sync batch for ${difference} units\n`);
            syncedCount++;
          }
          continue;
        }

        // No batches exist - create initial batch
        const batchNumber = `INIT-${product.sku || product._id.toString().slice(-6)}-${Date.now()}`;
        
        const newBatch = new ProductBatch({
          product: product._id,
          batchNumber: batchNumber,
          quantity: product.quantity,
          unitCost: product.price || 0,
          receivedDate: new Date(),
          manufacturingDate: new Date(),
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
          supplier: null,
          notes: 'Initial batch created during sync'
        });

        await newBatch.save();
        console.log(`✅ ${product.name}: Created initial batch`);
        console.log(`   Batch: ${batchNumber}`);
        console.log(`   Quantity: ${product.quantity}`);
        console.log(`   Unit Cost: ₹${product.price || 0}\n`);
        
        syncedCount++;

      } catch (error) {
        console.error(`❌ Error syncing ${product.name}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 SYNC SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total products checked: ${products.length}`);
    console.log(`✅ Synced/Created: ${syncedCount}`);
    console.log(`⏭️  Skipped (already synced): ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log('='.repeat(60));

    console.log('\n💡 HOW THE BILLING SYSTEM WORKS NOW:');
    console.log('   1. When you create a bill, it uses FIFO (oldest batch first)');
    console.log('   2. Each batch can have a different price');
    console.log('   3. System automatically deducts from multiple batches if needed');
    console.log('   4. Example: Bill 15 units when you have:');
    console.log('      - Batch 1: 10 units @ ₹100 (old price)');
    console.log('      - Batch 2: 10 units @ ₹120 (new price)');
    console.log('      Result: Bill shows:');
    console.log('        • 10 units @ ₹100 = ₹1000');
    console.log('        • 5 units @ ₹120 = ₹600');
    console.log('        • Total: ₹1600\n');

    console.log('✅ Sync complete! You can now create bills without batch errors.\n');

    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Fatal Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the sync
syncProductBatches();
