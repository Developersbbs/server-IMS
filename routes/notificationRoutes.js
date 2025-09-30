const express = require('express');
const router = express.Router();
const {
  getNotifications,
  markAsRead,
  getUnreadCount
} = require('../controllers/notificationController');
const { protect, allowRoles } = require('../middlewares/authMiddlewares');

router.route('/')
  .get(protect, allowRoles('superadmin', 'stockmanager'), getNotifications);

router.route('/unread-count')
  .get(protect, allowRoles('superadmin', 'stockmanager'), getUnreadCount);

router.route('/:id/read')
  .patch(protect, allowRoles('superadmin', 'stockmanager'), markAsRead);

module.exports = router;
