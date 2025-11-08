const jwt = require('jsonwebtoken');
const User = require('../models/User');

// CSRF protection middleware
const csrfProtection = (req, res, next) => {
  // Skip CSRF check for GET/HEAD/OPTIONS/TRACE methods
  const safeMethods = ['GET', 'HEAD', 'OPTIONS', 'TRACE'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Verify CSRF token for state-changing requests
  const csrfTokenFromHeader = req.headers['x-csrf-token'];
  const csrfTokenFromCookie = req.cookies['XSRF-TOKEN'];
  
  // CSRF token should match between header and cookie
  if (!csrfTokenFromHeader || !csrfTokenFromCookie || csrfTokenFromHeader !== csrfTokenFromCookie) {
    return res.status(403).json({ 
      message: 'Invalid CSRF token',
      code: 'INVALID_CSRF_TOKEN'
    });
  }
  next();
};

const protect = async (req, res, next) => {
  let token;

  // Check for token in cookies (httpOnly cookie)
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  } 
  // Fallback: check Authorization header (for API clients)
  else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ 
      success: false,
      message: 'Authentication required',
      code: 'NO_AUTH_TOKEN',
      redirect: '/login'
    });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verify user exists and is active
    const user = await User.findById(decoded.id).select('-password -__v');
    if (!user) {
      // Clear invalid token
      res.clearCookie('token');
      return res.status(401).json({ 
        success: false,
        message: 'User not found or account is disabled',
        code: 'USER_NOT_FOUND',
        redirect: '/login'
      });
    }

    // If status field is missing, set it to 'active' for backward compatibility
    if (user.status === undefined) {
      user.status = 'active';
      await user.save();
    }
    
    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).json({
        message: 'Account is not active',
        code: 'ACCOUNT_INACTIVE'
      });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (err) {
    // Handle different JWT errors specifically
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        message: 'Session expired. Please log in again.',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        message: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }

    console.error('Auth error:', err);
    return res.status(500).json({
      message: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
};

const allowRoles = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden, you don't have permission to access this route" });
    }
    next();
  };
};

module.exports = { protect, allowRoles, csrfProtection };