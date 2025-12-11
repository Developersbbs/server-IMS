const express = require('express');
const multer = require('multer');
const { protect, allowRoles } = require('../middlewares/authMiddlewares');
const { bucket } = require('../config/firebaseAdmin');

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

    console.log('Starting Firebase upload...');
    console.log('Bucket name:', bucket.name);
    console.log('File details:', {
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });

    // Create a unique filename (sanitize the original filename)
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const sanitizedOriginalName = req.file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    const fileName = `products/${timestamp}_${randomString}_${sanitizedOriginalName}`;
    
    console.log('Generated file name:', fileName);

    const file = bucket.file(fileName);

    // Create a write stream to Firebase Storage
    const blobStream = file.createWriteStream({
      metadata: {
        contentType: req.file.mimetype,
      },
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
        console.log('File uploaded successfully');
        
        // Make the file publicly accessible
        await file.makePublic();
        
        // Generate the correct public URL
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;
        
        console.log('Upload successful, public URL:', publicUrl);
        
        res.status(200).json({
          message: 'Image uploaded successfully',
          imageUrl: publicUrl,
        });
      } catch (error) {
        console.error('Error making file public or generating URL:', error);
        
        // If making public fails, try to get a signed URL as fallback
        try {
          const [signedUrl] = await file.getSignedUrl({
            action: 'read',
            expires: '03-09-2491', // Very far future date
          });
          
          res.status(200).json({
            message: 'Image uploaded successfully (with signed URL)',
            imageUrl: signedUrl,
          });
        } catch (signedUrlError) {
          console.error('Error generating signed URL:', signedUrlError);
          res.status(500).json({
            message: 'Upload successful but failed to generate public URL',
            error: error.message,
          });
        }
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

    console.log('Deleting image:', imageUrl);

    // Extract the file path from the URL
    let filePath;
    
    if (imageUrl.includes('storage.googleapis.com')) {
      // For public URLs: https://storage.googleapis.com/bucket-name/path/to/file
      const urlParts = imageUrl.split('/');
      const bucketIndex = urlParts.findIndex(part => part === bucket.name);
      if (bucketIndex !== -1 && bucketIndex < urlParts.length - 1) {
        filePath = urlParts.slice(bucketIndex + 1).join('/');
      }
    } else if (imageUrl.includes('firebasestorage.googleapis.com')) {
      // For Firebase Storage URLs, extract from the 'o=' parameter
      const url = new URL(imageUrl);
      const pathParam = url.searchParams.get('o');
      if (pathParam) {
        filePath = decodeURIComponent(pathParam);
      }
    }

    if (!filePath) {
      return res.status(400).json({ message: 'Could not extract file path from URL' });
    }

    console.log('Extracted file path:', filePath);

    const file = bucket.file(filePath);
    
    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({ message: 'Image not found' });
    }

    await file.delete();
    console.log('Image deleted successfully');
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