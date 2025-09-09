const User = require('../models/User');
const bcrypt = require('bcryptjs');

// Get all users (except superadmin)
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({ 
      role: { $in: ['stockmanager', 'billcounter'] } 
    }).select('-password');
    
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get user by ID
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.status(200).json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Create new user (superadmin only)
exports.createUser = async (req, res) => {
  const { username, email, password, role } = req.body;

  try {
    if (!username || !email || !password || !role) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Validate role
    if (!['stockmanager', 'billcounter'].includes(role)) {
      return res.status(400).json({ message: "Invalid role. Must be stockmanager or billcounter" });
    }

    // Check for existing user
    const userExists = await User.findOne({ 
      $or: [{ email }, { username }] 
    });
    
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const newUser = new User({ username, email, password, role });
    await newUser.save();

    // Return user without password
    const userResponse = await User.findById(newUser._id).select('-password');

    res.status(201).json({ 
      message: "User created successfully",
      user: userResponse
    });
  } catch (err) {
    console.error("❌ Create user error:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Update user (superadmin only)
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };

    // Remove password from updates if present (handle separately)
    if (updates.password) {
      delete updates.password;
    }

    // Validate role if provided
    if (updates.role && !['stockmanager', 'billcounter'].includes(updates.role)) {
      return res.status(400).json({ message: "Invalid role. Must be stockmanager or billcounter" });
    }

    const user = await User.findByIdAndUpdate(
      id, 
      updates, 
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ 
      message: "User updated successfully", 
      user 
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: "Username or email already exists" });
    }
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Update user password (superadmin only)
exports.updateUserPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ message: "Password is required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    await user.save();

    res.status(200).json({ message: "Password updated successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Delete user (superadmin only)
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findByIdAndDelete(id);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Get users statistics
exports.getUsersStats = async (req, res) => {
  try {
    const stats = await User.aggregate([
      {
        $match: { role: { $in: ['stockmanager', 'billcounter'] } }
      },
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);

    const result = {
      total: 0,
      stockmanager: 0,
      billcounter: 0
    };

    stats.forEach(stat => {
      result[stat._id] = stat.count;
      result.total += stat.count;
    });

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};