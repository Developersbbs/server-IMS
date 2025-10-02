const cron = require('node-cron');
const { deleteExpiredNotifications } = require('../controllers/notificationController');

let cleanupTask = null;

function scheduleNotificationCleanup() {
  if (cleanupTask) {
    cleanupTask.stop();
  }

  // Run daily at 02:00 AM server time
  cleanupTask = cron.schedule('0 2 * * *', async () => {
    try {
      const result = await deleteExpiredNotifications();
      if (result.deletedCount > 0) {
        console.log(`Notification cleanup job removed ${result.deletedCount} notifications.`);
      }
    } catch (error) {
      console.error('Notification cleanup job failed:', error.message || error);
    }
  }, {
    scheduled: true,
    timezone: 'UTC'
  });

  cleanupTask.start();
  console.log('Notification cleanup cron job scheduled for 02:00 AM daily.');

  // Run cleanup once at startup (non-blocking)
  deleteExpiredNotifications()
    .then((result) => {
      if (result.deletedCount > 0) {
        console.log(`Startup notification cleanup removed ${result.deletedCount} notifications.`);
      }
    })
    .catch((error) => {
      console.error('Startup notification cleanup failed:', error.message || error);
    });
}

module.exports = {
  scheduleNotificationCleanup
};
