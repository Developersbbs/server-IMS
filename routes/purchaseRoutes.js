// const express = require('express');
// const router = express.Router();
// const {
//   createPurchase,
//   getPurchases,
//   getPurchase,
//   updatePurchase,
//   deletePurchase,
//   approvePurchase,
//   rejectPurchase,
//   receivePurchase
// } = require('../controllers/purchaseController');
// const { protect, admin } = require('../middleware/authMiddleware');

// router.route('/')
//   .post(protect, createPurchase)
//   .get(protect, getPurchases);

// router.route('/:id')
//   .get(protect, getPurchase)
//   .put(protect, updatePurchase)
//   .delete(protect, admin, deletePurchase);

// router.route('/:id/approve')
//   .put(protect, admin, approvePurchase);

// router.route('/:id/reject')
//   .put(protect, admin, rejectPurchase);

// router.route('/:id/receive')
//   .put(protect, receivePurchase);

// module.exports = router;