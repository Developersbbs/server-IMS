const mongoose = require('mongoose');

const notificationSettingSchema = new mongoose.Schema({
  autoDeleteDays: {
    type: Number,
    min: 0,
    default: 30,
    description: 'Number of days after which notifications are automatically deleted. Set 0 to disable.'
  },
  allowManualDelete: {
    type: Boolean,
    default: true,
    description: 'Controls whether users can manually delete notifications.'
  }
}, {
  timestamps: true
});

notificationSettingSchema.statics.getSingleton = async function () {
  let doc = await this.findOne();
  if (!doc) {
    doc = await this.create({});
  }
  return doc;
};

module.exports = mongoose.model('NotificationSetting', notificationSettingSchema);
