const express = require('express');
const router = express.Router();
const {
  getMyAccount,
  lookupAccount,
  transfer,
  deposit,
  withdraw,
  getTransactions,
  getTransactionById,
  getAllUsersAdmin,
  updateUserStatusAdmin,
  deleteTransactionAdmin,
} = require('../controllers/accountController');
const authMiddleware = require('../middleware/authMiddleware');

// Nhóm API Tài khoản & Giao dịch
router.get('/me', authMiddleware, getMyAccount);
router.get('/lookup/:account_number', authMiddleware, lookupAccount);
router.post('/transfer', authMiddleware, transfer);
router.post('/deposit', authMiddleware, deposit);
router.post('/withdraw', authMiddleware, withdraw);
router.get('/transactions', authMiddleware, getTransactions);
router.get('/transactions/:id', authMiddleware, getTransactionById);

// Nhóm API Quản trị hệ thống (PATCH, DELETE, GET)
router.get('/admin/users', authMiddleware, getAllUsersAdmin);
router.patch('/admin/users/:id/status', authMiddleware, updateUserStatusAdmin);
router.delete('/admin/transactions/:id', authMiddleware, deleteTransactionAdmin);

module.exports = router;