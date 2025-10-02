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
  .get(protect, allowRoles('superadmin', 'stockmanager', 'billcounter'), getNotifications);

router.route('/unread-count')
  .get(protect, allowRoles('superadmin', 'stockmanager', 'billcounter'), getUnreadCount);

router.route('/settings')
  .get(protect, allowRoles('superadmin'), getNotificationSettings)
  .put(protect, allowRoles('superadmin'), updateNotificationSettings);

router.route('/:id/read')
  .patch(protect, allowRoles('superadmin', 'stockmanager', 'billcounter'), markAsRead);

router.route('/:id')
  .delete(protect, allowRoles('superadmin', 'stockmanager', 'billcounter'), deleteNotification);

module.exports = router;
