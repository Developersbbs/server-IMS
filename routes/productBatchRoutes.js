const express = require('express');
const router = express.Router();
const ProductBatch = require('../models/ProductBatch');
const { protect } = require('../middlewares/authMiddlewares');

// Get oldest batch for a product (FIFO)
router.get('/product/:productId/oldest', protect, async (req, res) => {
  try {
    const { productId } = req.params;

    // Find the oldest batch with available quantity (FIFO order)
    const batch = await ProductBatch.findOne({
      product: productId,
      quantity: { $gt: 0 }
    })
      .sort({ receivedDate: 1, manufacturingDate: 1, createdAt: 1 })
      .select('unitCost quantity batchNumber');

    if (!batch) {
      return res.status(404).json({
        message: 'No available batches found for this product'
      });
    }

    res.status(200).json(batch);
  } catch (error) {
    console.error('Error fetching oldest batch:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
});

// Get all batches for a product
router.get('/product/:productId', protect, async (req, res) => {
  try {
    const { productId } = req.params;

    const batches = await ProductBatch.find({
      product: productId,
      quantity: { $gt: 0 }
    })
      .sort({ receivedDate: 1, manufacturingDate: 1, createdAt: 1 })
      .select('unitCost quantity batchNumber receivedDate expiryDate');

    res.status(200).json({
      batches,
      count: batches.length
    });
  } catch (error) {
    console.error('Error fetching batches:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
});

module.exports = router;
