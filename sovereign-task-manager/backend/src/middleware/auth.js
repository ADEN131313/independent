const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes - require authentication
const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({
        error: 'Not authorized',
        message: 'No token provided'
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from token
      const user = await User.findById(decoded.user.id).select('-password');

      if (!user) {
        return res.status(401).json({
          error: 'Not authorized',
          message: 'User not found'
        });
      }

      req.user = user;
      next();
    } catch (error) {
      return res.status(401).json({
        error: 'Not authorized',
        message: 'Invalid token'
      });
    }
  } catch (error) {
    res.status(500).json({
      error: 'Server Error',
      message: 'Authentication middleware failed'
    });
  }
};

// Grant access to specific roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Not authorized',
        message: 'User not authenticated'
      });
    }

    if (!roles.includes(req.user.subscription.plan)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `User role '${req.user.subscription.plan}' is not authorized to access this resource`
      });
    }

    next();
  };
};

// Check resource ownership
const checkOwnership = (model) => {
  return async (req, res, next) => {
    try {
      const resource = await model.findById(req.params.id);

      if (!resource) {
        return res.status(404).json({
          error: 'Not found',
          message: 'Resource not found'
        });
      }

      // Check if user owns the resource or is admin
      const isOwner = resource.assignee?.equals(req.user._id) ||
                     resource.createdBy?.equals(req.user._id) ||
                     resource.user?.equals(req.user._id);

      const isAdmin = req.user.subscription.plan === 'enterprise';

      if (!isOwner && !isAdmin) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to access this resource'
        });
      }

      req.resource = resource;
      next();
    } catch (error) {
      res.status(500).json({
        error: 'Server Error',
        message: 'Ownership check failed'
      });
    }
  };
};

// Optional authentication - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.token) {
      token = req.cookies.token;
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.user.id).select('-password');
        if (user) {
          req.user = user;
        }
      } catch (error) {
        // Silent fail for optional auth
      }
    }

    next();
  } catch (error) {
    next();
  }
};

// Rate limiting for specific routes
const createRateLimit = (windowMs, max, message) => {
  return (req, res, next) => {
    // Simple in-memory rate limiting (use Redis in production)
    const key = `${req.ip}:${req.originalUrl}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!global.rateLimitStore) {
      global.rateLimitStore = new Map();
    }

    const requests = global.rateLimitStore.get(key) || [];
    const validRequests = requests.filter(time => time > windowStart);

    if (validRequests.length >= max) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: message || 'Rate limit exceeded'
      });
    }

    validRequests.push(now);
    global.rateLimitStore.set(key, validRequests);

    // Clean up old entries occasionally
    if (Math.random() < 0.01) {
      for (const [k, v] of global.rateLimitStore) {
        global.rateLimitStore.set(k, v.filter(time => time > windowStart));
        if (global.rateLimitStore.get(k).length === 0) {
          global.rateLimitStore.delete(k);
        }
      }
    }

    next();
  };
};

// API rate limiting
const apiLimiter = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  100, // 100 requests
  'API rate limit exceeded. Please try again later.'
);

// Auth rate limiting (stricter)
const authLimiter = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  5, // 5 attempts
  'Too many authentication attempts. Please try again later.'
);

module.exports = {
  protect,
  authorize,
  checkOwnership,
  optionalAuth,
  createRateLimit,
  apiLimiter,
  authLimiter
};