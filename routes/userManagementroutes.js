const express = require('express');
const {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  updateUserPassword,
  deleteUser,
  getUsersStats
} = require('../controllers/userManagementController');
const { protect, allowRoles } = require('../middlewares/authMiddlewares');

const router = express.Router();

// All routes require superadmin role
router.use(protect);
router.use(allowRoles('superadmin'));

// GET /api/users/stats - Get users statistics
router.get('/stats', getUsersStats);

// GET /api/users - Get all users
router.get('/', getAllUsers);

// GET /api/users/:id - Get user by ID
router.get('/:id', getUserById);

// POST /api/users - Create new user
router.post('/', createUser);

// PUT /api/users/:id - Update user
router.put('/:id', updateUser);

// PUT /api/users/:id/password - Update user password
router.put('/:id/password', updateUserPassword);

// DELETE /api/users/:id - Delete user
router.delete('/:id', deleteUser);

module.exports = router;