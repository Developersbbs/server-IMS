// routes/customerRoutes.js
const express = require('express');
const router = express.Router();
const {
  getAllCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomersStats
} = require('../controllers/customerController');
const { protect, allowRoles } = require('../middlewares/authMiddlewares');

router.use(protect);

// GET /api/customers/stats - Get customer statistics
router.get('/stats', allowRoles('superadmin', 'billcounter',"stockmanager"), getCustomersStats);

// GET /api/customers - Get all customers
router.get('/', allowRoles('superadmin', 'billcounter',"stockmanager"), getAllCustomers);

// GET /api/customers/:id - Get customer by ID
router.get('/:id', allowRoles('superadmin', 'billcounter',"stockmanager"), getCustomerById);

// POST /api/customers - Create new customer
router.post('/', allowRoles('superadmin', 'billcounter',"stockmanager"), createCustomer);

// PUT /api/customers/:id - Update customer
router.put('/:id', allowRoles('superadmin', 'billcounter',"stockmanager"), updateCustomer);

// DELETE /api/customers/:id - Delete customer
router.delete('/:id', allowRoles('superadmin',"stockmanager",'billcounter'), deleteCustomer);

module.exports = router;