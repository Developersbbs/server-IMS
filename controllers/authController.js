const User = require ('../models/User');
const jwt = require('jsonwebtoken');

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
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user._id,role:user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });

     // ✅ Store token in httpOnly cookie
    res.cookie("token", token, {
      httpOnly: true,   // JS can't access
      secure: process.env.NODE_ENV === "production", // only HTTPS in prod
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    });

    res.status(200).json({ token, user: { id: user._id, username: user.username, role: user.role } });
  } catch (err) {
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