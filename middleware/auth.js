const jwt = require('jsonwebtoken');
const User = require('../models/User');

const resolveUserFromToken = async (req) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return null;
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findById(decoded.userId);
  return user || null;
};

const auth = async (req, res, next) => {
  try {
    const user = await resolveUserFromToken(req);
    if (!user) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token.' });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const user = await resolveUserFromToken(req);
    req.user = user;
    next();
  } catch (error) {
    req.user = null;
    next();
  }
};

const adminAuth = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admin required.' });
  }
  next();
};

module.exports = { auth, optionalAuth, adminAuth };
