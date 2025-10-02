const express = require('express');
const router = express.Router();
const {
  getNotifications,
  markAsRead,
  getUnreadCount,
  deleteNotification,
  getNotificationSettings,
  updateNotificationSettings
} = require('../controllers/notificationController');
const { protect, allowRoles } = require('../middlewares/authMiddlewares');

router.route('/')
  .get(protect, allowRoles('superadmin', 'stockmanager'), getNotifications);

router.route('/unread-count')
  .get(protect, allowRoles('superadmin', 'stockmanager'), getUnreadCount);

router.route('/settings')
  .get(protect, allowRoles('superadmin'), getNotificationSettings)
  .put(protect, allowRoles('superadmin'), updateNotificationSettings);

router.route('/:id/read')
  .patch(protect, allowRoles('superadmin', 'stockmanager'), markAsRead);

router.route('/:id')
  .delete(protect, allowRoles('superadmin', 'stockmanager'), deleteNotification);

module.exports = router;
