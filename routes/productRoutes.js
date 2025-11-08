// routes/productRoutes.js
const express = require('express');
const { 
  getProducts, 
  getProductById, 
  createProduct, 
  updateProduct, 
  updateProductQuantity,
  deleteProduct,
  getCategories,
  getLowStockProducts,
  bulkUpdateProducts,
  getProductReport,
  getProductStats
} = require('../controllers/productController');
const { protect, allowRoles } = require('../middlewares/authMiddlewares');

const router = express.Router();

// Public routes
router.get('/categories', protect, getCategories); // Must be before /:id route
router.get('/stats', protect, getProductStats); // Must be before /:id route
router.get('/report', protect, allowRoles("superadmin", "stockmanager"), getProductReport);
router.get('/', protect, getProducts);
router.get('/:id', protect, getProductById);

// Protected routes (Admin/Stock Manager only)
router.post('/', protect, allowRoles("superadmin", "stockmanager"), createProduct);
router.put('/:id', protect, allowRoles("superadmin", "stockmanager"), updateProduct);
router.patch('/:id/quantity', protect, allowRoles("superadmin", "stockmanager"), updateProductQuantity);
router.delete('/:id', protect, allowRoles("superadmin", "stockmanager"), deleteProduct);

// Additional protected routes
router.get('/stock/low-stock', protect, allowRoles("superadmin", "stockmanager"), getLowStockProducts);
router.patch('/bulk-update', protect, allowRoles("superadmin", "stockmanager"), bulkUpdateProducts);

module.exports = router;