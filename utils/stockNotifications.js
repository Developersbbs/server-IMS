const Notification = require('../models/Notification');

const LOW_STOCK_THRESHOLD = 10;

async function upsertNotification(filter, update) {
  return Notification.findOneAndUpdate(
    filter,
    {
      ...update,
      isRead: false,
      createdAt: new Date()
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  );
}

async function clearNotifications(productId, types) {
  return Notification.deleteMany({
    productId,
    type: { $in: Array.isArray(types) ? types : [types] },
    isRead: false
  });
}

async function handleStockNotifications(product, newQuantity) {
  if (!product || typeof newQuantity !== 'number') {
    return;
  }

  const productId = product._id;
  if (!productId) {
    return;
  }

  if (newQuantity === 0) {
    await upsertNotification(
      { productId, type: 'out-of-stock', isRead: false },
      {
        message: `${product.name} is out of stock`,
        productId,
        type: 'out-of-stock'
      }
    );
    await clearNotifications(productId, 'low-stock');
    return;
  }

  if (newQuantity < LOW_STOCK_THRESHOLD) {
    await upsertNotification(
      { productId, type: 'low-stock', isRead: false },
      {
        message: `${product.name} is low in stock (${newQuantity} remaining)`,
        productId,
        type: 'low-stock'
      }
    );
    await clearNotifications(productId, 'out-of-stock');
    return;
  }

  await clearNotifications(productId, ['low-stock', 'out-of-stock']);
}

module.exports = {
  handleStockNotifications
};
