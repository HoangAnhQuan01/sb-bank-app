const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    from_account_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    to_account_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    type: {
      type: String,
      enum: ['transfer', 'deposit', 'withdraw'],
      default: 'transfer',
    },
    amount: { type: Number, required: true },
    description: { type: String, default: 'Chuyển tiền nội bộ' },
    status: { type: String, enum: ['success', 'failed'], default: 'success' },
    // Khóa chống gửi trùng lặp giao dịch (Idempotency Key)
    idempotency_key: { type: String, index: true },
  },
  { timestamps: true }
);

const Transaction = mongoose.model('Transaction', transactionSchema);

// Tự động dọn Index unique cũ (nếu có) để tránh xung đột dữ liệu cũ
Transaction.collection.dropIndex('idempotency_key_1').catch(() => {});

module.exports = Transaction;