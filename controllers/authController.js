const User = require ('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Register user
exports.registerUser = async (req, res) => {
  const { username, email, password, role } = req.body;

  try {
    if (!username || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check for existing user (email or username)
    const userExists = await User.findOne({ 
      $or: [{ email }, { username }] 
    });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const newUser = new User({ username, email, password, role });
    await newUser.save();

    res.status(201).json({ 
      message: "User registered successfully",
      user: { id: newUser._id, username: newUser.username, email: newUser.email, role: newUser.role }
    });
  } catch (err) {
    console.error("❌ Register error:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


// Login user
exports.loginUser = async (req, res) => {
  const { email, password } = req.body;
  
  console.log('🔐 Login attempt:', { email, hasPassword: !!password, timestamp: new Date().toISOString() });
  
  // Input validation
  if (!email || !password) {
    console.log('❌ Missing credentials');
    return res.status(400).json({ 
      message: 'Email and password are required',
      code: 'MISSING_CREDENTIALS'
    });
  }

  try {
    // Rate limiting would be handled by express-rate-limit
    const user = await User.findOne({ email });
    
    // Generic error message to prevent user enumeration
    const authError = {
      message: 'Invalid email or password',
      code: 'INVALID_CREDENTIALS'
    };

    if (!user) {
      console.log('❌ User not found:', email);
      return res.status(401).json(authError);
    }
    
    console.log('✅ User found:', { email, role: user.role, status: user.status });

    // Check if account is locked
    if (user.failedLoginAttempts >= 5) {
      const lockoutTime = 15 * 60 * 1000; // 15 minutes
      const timeSinceLockout = Date.now() - user.lastFailedLogin.getTime();
      
      if (timeSinceLockout < lockoutTime) {
        return res.status(429).json({
          message: `Account temporarily locked. Please try again in ${Math.ceil((lockoutTime - timeSinceLockout) / 60000)} minutes.`,
          code: 'ACCOUNT_LOCKED',
          retryAfter: Math.ceil((lockoutTime - timeSinceLockout) / 1000)
        });
      } else {
        // Reset failed attempts after lockout period
        user.failedLoginAttempts = 0;
        await user.save();
      }
    }

    const isMatch = await user.matchPassword(password);
    console.log('🔑 Password match:', isMatch);
    
    if (!isMatch) {
      // Increment failed login attempts
      user.failedLoginAttempts += 1;
      user.lastFailedLogin = Date.now();
      await user.save();
      
      console.log('❌ Password mismatch for:', email);
      return res.status(401).json(authError);
    }
    
    console.log('✅ Password correct, generating token...');

    // Reset failed login attempts on successful login
    if (user.failedLoginAttempts > 0) {
      user.failedLoginAttempts = 0;
      await user.save();
    }

    // Generate JWT token with 7 days expiration
    const token = jwt.sign(
      { 
        id: user._id,
        role: user.role,
        // Add session-specific claims
        sessionId: crypto.randomUUID()
      }, 
      process.env.JWT_SECRET, 
      { 
        expiresIn: '24h',
        issuer: 'inventory-system-api',
        audience: 'inventory-system-client'
      }
    );

    // Generate CSRF token
    const csrfToken = crypto.randomBytes(32).toString('hex');

    // Determine if we should use secure cookies (only in production with HTTPS)
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Set token in HTTP-only cookie with 7 days expiration
    res.cookie('token', token, {
      httpOnly: true,
      secure: false, // Set to false for localhost development (HTTP)
      sameSite: 'lax', // Changed from 'strict' to 'lax' for better compatibility
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/' // Ensure cookie is sent for all paths
    });
    
    // Also set a non-httpOnly cookie for CSRF protection
    res.cookie('XSRF-TOKEN', csrfToken, {
      secure: false, // Set to false for localhost development (HTTP)
      sameSite: 'lax', // Changed to 'lax' for better compatibility
      maxAge: 24 * 60 * 60 * 1000, // 1 day
      path: '/'
    });

    // Don't send sensitive data in response
    const userResponse = {
      id: user._id,
      username: user.username,
      role: user.role,
      email: user.email,
      // Add other non-sensitive user data as needed
    };

    console.log('✅ Login successful for:', email, '| Role:', user.role);
    
    res.status(200).json({ 
      user: userResponse,
      token: token, // Send token in response for client-side storage
      csrfToken // Send CSRF token in response for single-page applications
    });
  } catch (err) {
    console.error('❌ Login error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update user info
exports.updateUserInfo = async (req, res) => {
  try {
    const { id } = req.params; // user ID from URL
    const updates = req.body;  // fields to update

    // Prevent updating sensitive fields directly
    if (updates.password) {
      return res.status(400).json({ message: "Password cannot be updated here" });
    }

    // If only self can update → check req.user.id
    if (req.user.role !== "superadmin" && req.user.id !== id) {
      return res.status(403).json({ message: "Forbidden: You can only update your own account" });
    }

    const user = await User.findByIdAndUpdate(id, updates, { new: true }).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "User updated successfully", user });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
exports.logoutUser = (req, res) => {
  // To log out, we clear the httpOnly cookie by setting its value to nothing
  // and its expiration date to a past date.
  res.cookie('token', '', {
    httpOnly: true,
    expires: new Date(0), // Set expiration to a past date
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
  res.status(200).json({ message: 'Logged out successfully' });
};
// In authController.js

// Get all users (superadmin only)
exports.getAllUsers = async (req, res) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ message: 'Forbidden: Only superadmin can access all users' });
    }
    
    const users = await User.find().select('-password');
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Delete user (superadmin only)
exports.deleteUser = async (req, res) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ message: 'Forbidden: Only superadmin can delete users' });
    }
    
    const { id } = req.params;
    
    // Prevent superadmin from deleting themselves
    if (id === req.user.id) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }
    
    const user = await User.findByIdAndDelete(id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};


// Get user information
exports.getUserInfo = (req, res) => {
  res.status(200).json(req.user);
};

// Refresh token endpoint
exports.refreshToken = async (req, res) => {
  try {
    // The token is already verified by the protect middleware if needed
    // For now, we'll issue a new token if the request has a valid httpOnly cookie
    const token = req.cookies.token;
    
    if (!token) {
      return res.status(401).json({ 
        message: 'No token found',
        code: 'NO_TOKEN'
      });
    }

    try {
      // Verify the existing token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Check if user still exists
      const user = await User.findById(decoded.id);
      if (!user || user.status !== 'active') {
        res.clearCookie('token');
        return res.status(401).json({ 
          message: 'User not found or account is inactive',
          code: 'USER_INACTIVE'
        });
      }

      // Generate a new token
      const newToken = jwt.sign(
        { 
          id: user._id,
          role: user.role,
          sessionId: crypto.randomUUID()
        }, 
        process.env.JWT_SECRET, 
        { 
          expiresIn: '24h',
          issuer: 'inventory-system-api',
          audience: 'inventory-system-client'
        }
      );

      // Set new token in httpOnly cookie
      res.cookie('token', newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000, // 1 day
        path: '/'
      });

      res.status(200).json({ 
        token: newToken,
        message: 'Token refreshed successfully'
      });
    } catch (tokenError) {
      if (tokenError.name === 'TokenExpiredError') {
        res.clearCookie('token');
        return res.status(401).json({
          message: 'Token expired',
          code: 'TOKEN_EXPIRED'
        });
      }
      throw tokenError;
    }
  } catch (err) {
    console.error('Token refresh error:', err);
    res.status(500).json({ 
      message: 'Failed to refresh token',
      error: err.message 
    });
  }
};