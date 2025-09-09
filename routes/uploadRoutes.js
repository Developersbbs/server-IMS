// routes/uploadRoutes.js
const express = require('express');
const AWS = require('aws-sdk');
const multer = require('multer');
const { protect, allowRoles } = require('../middlewares/authMiddlewares');

const router = express.Router();

// Configure AWS SDK v2
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const s3 = new AWS.S3();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  },
});

// @desc    Upload image to S3
// @route   POST /api/upload/image
// @access  Private (superadmin/stockmanager)
router.post('/image', protect, allowRoles("superadmin", "stockmanager"), upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const uniqueName = `products/${Date.now()}-${Math.round(Math.random() * 1E9)}-${req.file.originalname}`;

    const uploadParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: uniqueName,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      // FIXED: The 'ACL' property is removed to support modern S3 buckets.
      // Public access should be managed via a Bucket Policy in the AWS S3 console.
    };

    console.log('Starting S3 upload...');
    const result = await s3.upload(uploadParams).promise();
    console.log('S3 upload successful:', result.Location);

    res.status(200).json({
      message: 'Image uploaded successfully',
      imageUrl: result.Location,
    });

  } catch (error) {
    console.error('=== UPLOAD ERROR ===', error);
    res.status(500).json({
      message: 'Error uploading image',
      error: error.message,
    });
  }
});

// @desc    Delete image from S3
// @route   DELETE /api/upload/image
// @access  Private (superadmin/stockmanager)
router.delete('/image', protect, allowRoles("superadmin", "stockmanager"), async (req, res) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ message: 'Image URL is required' });
    }

    // Extract the key from the full S3 URL
    const key = new URL(imageUrl).pathname.substring(1);
    console.log('Extracted key for deletion:', key);

    const deleteParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
    };

    // FIXED: Use the correct AWS SDK v2 syntax for deleting an object.
    await s3.deleteObject(deleteParams).promise();
    console.log('Image deleted successfully from S3');

    res.status(200).json({ message: 'Image deleted successfully' });

  } catch (error) {
    console.error('=== DELETE ERROR ===', error);
    res.status(500).json({
      message: 'Error deleting image',
      error: error.message,
    });
  }
});

module.exports = router;