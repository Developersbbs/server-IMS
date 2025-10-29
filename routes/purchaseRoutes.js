const express = require('express');
const router = express.Router();
const {
  createPurchase,
  getPurchases,
  getPurchase,
  updatePurchase,
  deletePurchase,
  approvePurchase,
  rejectPurchase,
  receivePurchase,
  getPurchaseStats
} = require('../controllers/purchaseController');
const { protect, allowRoles } = require('../middlewares/authMiddlewares');

router.route('/')
  .post(protect, createPurchase)
  .get(protect, getPurchases);

router.route('/:id')
  .get(protect, getPurchase)
  .put(protect, updatePurchase)
  .delete(protect, allowRoles('superadmin', 'stockmanager'), deletePurchase);

router.route('/:id/approve')
  .put(protect, allowRoles('superadmin', 'stockmanager'), approvePurchase);

router.route('/:id/reject')
  .put(protect, allowRoles('superadmin', 'stockmanager'), rejectPurchase);

router.route('/:id/receive')
  .put(protect, receivePurchase);

router.route('/stats/overview')
  .get(protect, getPurchaseStats);

module.exports = router;