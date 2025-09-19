const express = require('express');
const multer = require('multer');
const { protect, allowRoles } = require('../middlewares/authMiddlewares');
const admin = require('firebase-admin');

const router = express.Router();

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

// @desc    Upload image to Firebase Storage
// @route   POST /api/upload/image
// @access  Private (superadmin/stockmanager)
router.post('/image', protect, allowRoles("superadmin", "stockmanager"), upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Create a unique filename
    const timestamp = Date.now();
    const fileName = `products/${timestamp}_${req.file.originalname}`;
    const file = bucket.file(fileName);

    // Create a write stream to Firebase Storage
    const blobStream = file.createWriteStream({
      metadata: {
        contentType: req.file.mimetype,
      },
      public: true, // Make the file publicly accessible
    });

    blobStream.on('error', (error) => {
      console.error('Firebase upload error:', error);
      res.status(500).json({
        message: 'Error uploading image to Firebase',
        error: error.message,
      });
    });

    blobStream.on('finish', async () => {
      try {
        // Make the file public
        await file.makePublic();
        
        // Get the public URL
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;
        
        res.status(200).json({
          message: 'Image uploaded successfully',
          imageUrl: publicUrl,
        });
      } catch (error) {
        console.error('Error making file public:', error);
        res.status(500).json({
          message: 'Error finalizing upload',
          error: error.message,
        });
      }
    });

    // End the stream with the file buffer
    blobStream.end(req.file.buffer);

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      message: 'Error uploading image',
      error: error.message,
    });
  }
});

// @desc    Delete image from Firebase Storage
// @route   DELETE /api/upload/image
// @access  Private (superadmin/stockmanager)
router.delete('/image', protect, allowRoles("superadmin", "stockmanager"), async (req, res) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ message: 'Image URL is required' });
    }

    // Extract the file path from the URL
    const url = new URL(imageUrl);
    const pathname = url.pathname;
    
    // Remove the bucket name from the path
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET?.replace('gs://', '') || 'shree-sai-engineering';
    let filePath = pathname;
    
    if (pathname.startsWith(`/${bucketName}/`)) {
      filePath = pathname.substring(`/${bucketName}/`.length);
    } else if (pathname.startsWith('/')) {
      filePath = pathname.substring(1);
    }

    const file = bucket.file(filePath);
    
    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({ message: 'Image not found' });
    }

    await file.delete();
    res.status(200).json({ message: 'Image deleted successfully' });

  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      message: 'Error deleting image',
      error: error.message,
    });
  }
});

module.exports = router;