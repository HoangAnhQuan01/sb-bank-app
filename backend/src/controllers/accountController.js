const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const User = require('../models/User');

// [API 6] GET /api/accounts/me - Lấy thông tin tài khoản hiện tại
exports.getMyAccount = async (req, res) => {
  try {
    const account = await Account.findOne({ user_id: req.user.id }).populate(
      'user_id',
      'full_name email role status'
    );

    if (!account) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản ngân hàng!' });
    }

    return res.status(200).json({
      account_number: account.account_number,
      balance: account.balance,
      currency: account.currency,
      full_name: account.user_id.full_name,
      email: account.user_id.email,
      role: account.user_id.role,
      status: account.user_id.status,
    });
  } catch (error) {
    console.error('Get account error:', error);
    return res.status(500).json({ message: 'Lỗi khi lấy thông tin tài khoản!' });
  }
};

// [API 7] GET /api/accounts/lookup/:account_number - Tra cứu tên chủ tài khoản nhận
exports.lookupAccount = async (req, res) => {
  try {
    const { account_number } = req.params;
    const account = await Account.findOne({ account_number }).populate('user_id', 'full_name');

    if (!account || !account.user_id) {
      return res.status(404).json({ message: 'Không tìm thấy chủ tài khoản này!' });
    }

    return res.status(200).json({
      account_number: account.account_number,
      full_name: account.user_id.full_name,
    });
  } catch (error) {
    console.error('Lookup account error:', error);
    return res.status(500).json({ message: 'Lỗi khi tra cứu tài khoản!' });
  }
};

// [API 8] POST /api/accounts/transfer - Chuyển tiền nội bộ (Atomic Update & Idempotency)
exports.transfer = async (req, res) => {
  try {
    const { to_account_number, amount, description, idempotency_key } = req.body;
    const transferAmount = Number(amount);

    if (!to_account_number || !transferAmount || transferAmount <= 0) {
      return res.status(400).json({ message: 'Số tiền hoặc tài khoản nhận không hợp lệ!' });
    }

    // Kiểm tra chống trùng lặp giao dịch (Idempotency)
    if (idempotency_key) {
      const existingTx = await Transaction.findOne({ idempotency_key });
      if (existingTx) {
        return res.status(409).json({
          message: 'Giao dịch này đã được xử lý trước đó (chống trùng lặp)!',
          transaction: existingTx,
        });
      }
    }

    const fromAccount = await Account.findOne({ user_id: req.user.id });
    if (!fromAccount) {
      return res.status(404).json({ message: 'Tài khoản người gửi không tồn tại!' });
    }

    const toAccount = await Account.findOne({ account_number: to_account_number });
    if (!toAccount) {
      return res.status(404).json({ message: 'Tài khoản người nhận không tồn tại!' });
    }

    if (fromAccount.account_number === toAccount.account_number) {
      return res.status(400).json({ message: 'Không thể tự chuyển tiền cho chính mình!' });
    }

    // Trừ tiền nguyên tử (Atomic Update) chống lỗi Race Condition
    const updatedFromAccount = await Account.findOneAndUpdate(
      {
        _id: fromAccount._id,
        balance: { $gte: transferAmount },
      },
      { $inc: { balance: -transferAmount } },
      { new: true }
    );

    if (!updatedFromAccount) {
      return res.status(400).json({ message: 'Số dư không đủ để thực hiện giao dịch!' });
    }

    // Cộng tiền nguyên tử cho người nhận
    await Account.findByIdAndUpdate(toAccount._id, {
      $inc: { balance: transferAmount },
    });

    const newTransaction = new Transaction({
      from_account_id: fromAccount._id,
      to_account_id: toAccount._id,
      type: 'transfer',
      amount: transferAmount,
      description: description || 'Chuyển tiền nội bộ',
      status: 'success',
      idempotency_key: idempotency_key || undefined,
    });
    await newTransaction.save();

    return res.status(200).json({
      message: 'Chuyển tiền thành công!',
      remaining_balance: updatedFromAccount.balance,
      transaction: newTransaction,
    });
  } catch (error) {
    console.error('Transfer error:', error);
    return res.status(500).json({ message: 'Lỗi server khi chuyển tiền!' });
  }
};

// [API 9] POST /api/accounts/deposit - Nạp tiền vào tài khoản cá nhân
exports.deposit = async (req, res) => {
  try {
    const { amount, description, idempotency_key } = req.body;
    const depositAmount = Number(amount);

    if (!depositAmount || depositAmount <= 0) {
      return res.status(400).json({ message: 'Số tiền nạp phải lớn hơn 0!' });
    }

    if (idempotency_key) {
      const existingTx = await Transaction.findOne({ idempotency_key });
      if (existingTx) {
        return res.status(409).json({
          message: 'Giao dịch nạp tiền này đã được xử lý trước đó!',
          transaction: existingTx,
        });
      }
    }

    const updatedAccount = await Account.findOneAndUpdate(
      { user_id: req.user.id },
      { $inc: { balance: depositAmount } },
      { new: true }
    );

    if (!updatedAccount) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản ngân hàng!' });
    }

    const newTx = new Transaction({
      from_account_id: updatedAccount._id,
      to_account_id: updatedAccount._id,
      type: 'deposit',
      amount: depositAmount,
      description: description || 'Nạp tiền vào tài khoản',
      status: 'success',
      idempotency_key: idempotency_key || undefined,
    });
    await newTx.save();

    return res.status(200).json({
      message: 'Nạp tiền thành công!',
      remaining_balance: updatedAccount.balance,
      transaction: newTx,
    });
  } catch (error) {
    console.error('Deposit error:', error);
    return res.status(500).json({ message: 'Lỗi server khi nạp tiền!' });
  }
};

// [API 10] POST /api/accounts/withdraw - Rút tiền khỏi tài khoản cá nhân
exports.withdraw = async (req, res) => {
  try {
    const { amount, description, idempotency_key } = req.body;
    const withdrawAmount = Number(amount);

    if (!withdrawAmount || withdrawAmount <= 0) {
      return res.status(400).json({ message: 'Số tiền rút phải lớn hơn 0!' });
    }

    if (idempotency_key) {
      const existingTx = await Transaction.findOne({ idempotency_key });
      if (existingTx) {
        return res.status(409).json({
          message: 'Giao dịch rút tiền này đã được xử lý trước đó!',
          transaction: existingTx,
        });
      }
    }

    // Kiểm tra số dư và trừ tiền nguyên tử chống Race Condition
    const updatedAccount = await Account.findOneAndUpdate(
      {
        user_id: req.user.id,
        balance: { $gte: withdrawAmount },
      },
      { $inc: { balance: -withdrawAmount } },
      { new: true }
    );

    if (!updatedAccount) {
      return res.status(400).json({ message: 'Số dư không đủ để thực hiện rút tiền!' });
    }

    const newTx = new Transaction({
      from_account_id: updatedAccount._id,
      to_account_id: updatedAccount._id,
      type: 'withdraw',
      amount: withdrawAmount,
      description: description || 'Rút tiền từ tài khoản',
      status: 'success',
      idempotency_key: idempotency_key || undefined,
    });
    await newTx.save();

    return res.status(200).json({
      message: 'Rút tiền thành công!',
      remaining_balance: updatedAccount.balance,
      transaction: newTx,
    });
  } catch (error) {
    console.error('Withdraw error:', error);
    return res.status(500).json({ message: 'Lỗi server khi rút tiền!' });
  }
};

// [API 11] GET /api/accounts/transactions - Lấy danh sách lịch sử giao dịch
exports.getTransactions = async (req, res) => {
  try {
    const account = await Account.findOne({ user_id: req.user.id });
    if (!account) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản!' });
    }

    const transactions = await Transaction.find({
      $or: [{ from_account_id: account._id }, { to_account_id: account._id }],
    })
      .populate({
        path: 'from_account_id',
        select: 'account_number',
        populate: { path: 'user_id', select: 'full_name' },
      })
      .populate({
        path: 'to_account_id',
        select: 'account_number',
        populate: { path: 'user_id', select: 'full_name' },
      })
      .sort({ createdAt: -1 });

    return res.status(200).json(transactions);
  } catch (error) {
    console.error('Get transactions error:', error);
    return res.status(500).json({ message: 'Lỗi khi lấy lịch sử giao dịch!' });
  }
};

// [API 12] GET /api/accounts/transactions/:id - Xem chi tiết biên lai 1 giao dịch
exports.getTransactionById = async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.id)
      .populate({
        path: 'from_account_id',
        select: 'account_number',
        populate: { path: 'user_id', select: 'full_name email' },
      })
      .populate({
        path: 'to_account_id',
        select: 'account_number',
        populate: { path: 'user_id', select: 'full_name email' },
      });

    if (!tx) {
      return res.status(404).json({ message: 'Không tìm thấy biên lai giao dịch!' });
    }

    return res.status(200).json(tx);
  } catch (error) {
    console.error('Get transaction detail error:', error);
    return res.status(500).json({ message: 'Lỗi khi truy vấn chi tiết giao dịch!' });
  }
};

// [API 13] GET /api/accounts/admin/users - Lấy danh sách người dùng và số dư
exports.getAllUsersAdmin = async (req, res) => {
  try {
    const accounts = await Account.find()
      .populate('user_id', 'full_name email role status createdAt')
      .sort({ createdAt: -1 });
    return res.status(200).json(accounts);
  } catch (error) {
    console.error('Admin get users error:', error);
    return res.status(500).json({ message: 'Lỗi khi lấy danh sách người dùng!' });
  }
};

// [API 14] PATCH /api/accounts/admin/users/:id/status - Khóa hoặc mở khóa tài khoản
exports.updateUserStatusAdmin = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'locked'].includes(status)) {
      return res.status(400).json({ message: 'Trạng thái không hợp lệ (active hoặc locked)!' });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).select('-password_hash');

    if (!updatedUser) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng!' });
    }

    return res.status(200).json({
      message: `Đã cập nhật trạng thái tài khoản thành ${status}!`,
      user: updatedUser,
    });
  } catch (error) {
    console.error('Admin update status error:', error);
    return res.status(500).json({ message: 'Lỗi khi cập nhật trạng thái người dùng!' });
  }
};

// [API 15] DELETE /api/accounts/admin/transactions/:id - Xóa bản ghi nhật ký giao dịch
exports.deleteTransactionAdmin = async (req, res) => {
  try {
    const deletedTx = await Transaction.findByIdAndDelete(req.params.id);
    if (!deletedTx) {
      return res.status(404).json({ message: 'Không tìm thấy giao dịch cần xóa!' });
    }
    return res.status(200).json({
      message: 'Đã xóa bản ghi giao dịch thành công!',
      deleted_id: req.params.id,
    });
  } catch (error) {
    console.error('Admin delete transaction error:', error);
    return res.status(500).json({ message: 'Lỗi khi xóa bản ghi giao dịch!' });
  }
};