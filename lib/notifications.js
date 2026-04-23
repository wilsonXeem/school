const Notification = require('../models/Notification');

const createNotification = async ({
  userId,
  type = 'system',
  title,
  message,
  meta = {}
}) => {
  if (!userId || !title || !message) {
    return null;
  }

  try {
    const notification = await Notification.create({
      user_id: userId,
      type,
      title,
      message,
      meta,
      is_read: false
    });
    return notification;
  } catch (error) {
    return null;
  }
};

module.exports = {
  createNotification
};
