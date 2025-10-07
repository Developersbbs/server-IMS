// routes/billRoutes.js
const express = require('express');
const router = express.Router();
const {
  getAllBills,
  getBillById,
  createBill,
  updateBill,
  deleteBill,
  getBillsStats,
  generateInvoice
} = require('../controllers/billController');
const { protect, allowRoles } = require('../middlewares/authMiddlewares');

router.use(protect);

// GET /api/bills/stats - Get bill statistics
router.get('/stats', allowRoles('superadmin', 'billcounter','stockmanager'), getBillsStats);

// GET /api/bills - Get all bills
router.get('/', allowRoles('superadmin', 'billcounter','stockmanager'), getAllBills);

// GET /api/bills/:id - Get bill by ID
router.get('/:id', allowRoles('superadmin', 'billcounter','stockmanager'), getBillById);

// GET /api/bills/:id/invoice - Generate invoice PDF
router.get('/:id/invoice', allowRoles('superadmin', 'billcounter','stockmanager'), generateInvoice);

// POST /api/bills - Create new bill
router.post('/', allowRoles('superadmin', 'billcounter','stockmanager'), createBill);

// PUT /api/bills/:id - Update bill (superadmin only)
router.put('/:id', allowRoles('superadmin'), updateBill);

// DELETE /api/bills/:id - Delete bill
router.delete('/:id', allowRoles('superadmin',), deleteBill);

module.exports = router;