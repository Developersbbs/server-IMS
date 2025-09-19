const express = require('express');
const { registerUser, loginUser, getUserInfo, updateUserInfo, logoutUser, getAllUsers, deleteUser } = require('../controllers/authController');
const { protect,allowRoles } = require('../middlewares/authMiddlewares');

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/me', protect, getUserInfo);
router.put("/update/:id",protect,allowRoles("superadmin", "stockmanager"), updateUserInfo);
router.post('/logout',protect,logoutUser);

router.get('/users', protect, allowRoles('superadmin'), getAllUsers);
router.delete('/users/:id', protect, allowRoles('superadmin'), deleteUser);

module.exports = router;