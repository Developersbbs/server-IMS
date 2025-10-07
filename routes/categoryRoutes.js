const express = require('express');
const {
  getCategories,
  createCategory,
  updateCategory,
  toggleCategoryStatus,
  deleteCategory,
} = require('../controllers/categoryController');
const { protect, allowRoles } = require('../middlewares/authMiddlewares');

const router = express.Router();

// Public routes
router.get('/', protect, getCategories);

// Protected routes (Admin only)
router.post('/', protect, allowRoles("superadmin"), createCategory);
router.put('/:id', protect, allowRoles("superadmin"), updateCategory);
router.patch('/:id/status', protect, allowRoles("superadmin"), toggleCategoryStatus);
router.delete('/:id', protect, allowRoles("superadmin"), deleteCategory);

module.exports = router;
