const Notification = require('../models/Notification');
const NotificationSetting = require('../models/NotificationSetting');

// @desc    Get paginated notifications
// @route   GET /api/notifications?page=1&status=all
// @access  Private/Admin
const getNotifications = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const status = (req.query.status || 'all').toLowerCase();

    const filter = {};
    if (status === 'unread') {
      filter.isRead = false;
    } else if (status === 'read') {
      filter.isRead = true;
    }

    const skip = (page - 1) * limit;

    const [notifications, total, settings] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('productId', 'name')
        .lean(),
      Notification.countDocuments(filter),
      NotificationSetting.getSingleton()
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    res.status(200).json({
      data: notifications,
      meta: {
        page,
        limit,
        total,
        totalPages
      },
      settings: {
        allowManualDelete: settings.allowManualDelete,
        autoDeleteDays: settings.autoDeleteDays
      }
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error fetching notifications', 
      error: error.message 
    });
  }
};

// @desc    Delete a notification (respect settings)
// @route   DELETE /api/notifications/:id
// @access  Private/Admin
const deleteNotification = async (req, res) => {
  try {
    const settings = await NotificationSetting.getSingleton();
    if (!settings.allowManualDelete) {
      return res.status(403).json({ message: 'Manual deletion is disabled by administrator' });
    }

    const notification = await Notification.findByIdAndDelete(req.params.id);

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.status(200).json({ message: 'Notification deleted successfully' });
  } catch (error) {
    res.status(500).json({
      message: 'Error deleting notification',
      error: error.message
    });
  }
};

// @desc    Mark notification as read
// @route   PATCH /api/notifications/:id/read
// @access  Private/Admin
const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { isRead: true, readAt: new Date() },
      { new: true }
    );
    
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    
    res.status(200).json(notification);
  } catch (error) {
    res.status(500).json({ 
      message: 'Error updating notification', 
      error: error.message 
    });
  }
};

// @desc    Get unread notifications count
// @route   GET /api/notifications/unread-count
// @access  Private/Admin
const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({ isRead: false });
    res.status(200).json({ count });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error fetching unread count', 
      error: error.message 
    });
  }
};

// @desc    Get notification settings
// @route   GET /api/notifications/settings
// @access  Private/SuperAdmin
const getNotificationSettings = async (req, res) => {
  try {
    const settings = await NotificationSetting.getSingleton();
    res.status(200).json({
      autoDeleteDays: settings.autoDeleteDays,
      allowManualDelete: settings.allowManualDelete
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching notification settings',
      error: error.message
    });
  }
};

// @desc    Update notification settings
// @route   PUT /api/notifications/settings
// @access  Private/SuperAdmin
const updateNotificationSettings = async (req, res) => {
  try {
    const { autoDeleteDays, allowManualDelete } = req.body;

    const settings = await NotificationSetting.getSingleton();

    if (typeof autoDeleteDays !== 'undefined') {
      if (!Number.isInteger(autoDeleteDays) || autoDeleteDays < 0 || autoDeleteDays > 365) {
        return res.status(400).json({ message: 'autoDeleteDays must be an integer between 0 and 365' });
      }
      settings.autoDeleteDays = autoDeleteDays;
    }

    if (typeof allowManualDelete !== 'undefined') {
      settings.allowManualDelete = Boolean(allowManualDelete);
    }

    await settings.save();

    res.status(200).json({
      message: 'Notification settings updated',
      autoDeleteDays: settings.autoDeleteDays,
      allowManualDelete: settings.allowManualDelete
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error updating notification settings',
      error: error.message
    });
  }
};

// Helper to delete notifications older than autoDeleteDays
const deleteExpiredNotifications = async () => {
  try {
    const settings = await NotificationSetting.getSingleton();
    if (settings.autoDeleteDays === 0) {
      return { deletedCount: 0 };
    }

    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - settings.autoDeleteDays);

    const result = await Notification.deleteMany({ createdAt: { $lt: thresholdDate } });

    return { deletedCount: result.deletedCount || 0 };
  } catch (error) {
    console.error('Failed to delete expired notifications:', error);
    throw error;
  }
};

module.exports = {
  getNotifications,
  deleteNotification,
  markAsRead,
  getUnreadCount,
  getNotificationSettings,
  updateNotificationSettings,
  deleteExpiredNotifications
};
