const Notification = require('../models/Notification');

const DEFAULT_REORDER_LEVEL = 10;

function getReorderLevel(product) {
  const value = Number(product?.reorderLevel);
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_REORDER_LEVEL;
  }
  return value;
}

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

  const reorderLevel = getReorderLevel(product);

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

  if (newQuantity <= reorderLevel) {
    await upsertNotification(
      { productId, type: 'low-stock', isRead: false },
      {
        message: `${product.name} has reached its reorder level (${newQuantity} remaining, threshold ${reorderLevel})`,
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
