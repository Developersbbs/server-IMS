// routes/supplierRoutes.js
const express = require('express');
const router = express.Router();
const {
  getAllSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  getSuppliersStats
} = require('../controllers/supplierController');
const { protect, allowRoles } = require('../middlewares/authMiddlewares');

// All routes require authentication
router.use(protect);

// GET /api/suppliers/stats - Get supplier statistics
router.get('/stats', getSuppliersStats);

// GET /api/suppliers - Get all suppliers
router.get('/', allowRoles('superadmin', 'stockmanager'), getAllSuppliers);

// GET /api/suppliers/:id - Get supplier by ID
router.get('/:id', allowRoles('superadmin', 'stockmanager'), getSupplierById);

// POST /api/suppliers - Create new supplier
router.post('/', allowRoles('superadmin', 'stockmanager'), createSupplier);

// PUT /api/suppliers/:id - Update supplier
router.put('/:id', allowRoles('superadmin', 'stockmanager'), updateSupplier);

// DELETE /api/suppliers/:id - Delete supplier
router.delete('/:id', allowRoles('superadmin'), deleteSupplier);

module.exports = router;