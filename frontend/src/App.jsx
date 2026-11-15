import { useState, useEffect, useMemo, useCallback } from 'react';
import Login from './components/Login';
import Register from './components/Register';
import './App.css';

const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'tx-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
};

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [isRegistering, setIsRegistering] = useState(false);
  const [account, setAccount] = useState(null);
  const [activeTab, setActiveTab] = useState('transfer'); // 'transfer' | 'cash' | 'profile'

  // States cho Chuyển tiền & Tra cứu tên người nhận
  const [transactions, setTransactions] = useState([]);
  const [toAccount, setToAccount] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => generateUUID());
  const [transferMsg, setTransferMsg] = useState(null);
  const [loadingTransfer, setLoadingTransfer] = useState(false);

  // States cho Nạp / Rút tiền
  const [cashType, setCashType] = useState('deposit'); // 'deposit' | 'withdraw'
  const [cashAmount, setCashAmount] = useState('');
  const [cashDesc, setCashDesc] = useState('');
  const [cashMsg, setCashMsg] = useState(null);
  const [loadingCash, setLoadingCash] = useState(false);

  // States cho Cập nhật hồ sơ & Đổi mật khẩu
  const [editName, setEditName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [profileMsg, setProfileMsg] = useState(null);

  // States cho Bộ lọc & Tìm kiếm lịch sử giao dịch
  const [filterType, setFilterType] = useState('all'); // 'all' | 'in' | 'out'
  const [searchTerm, setSearchTerm] = useState('');

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    setToken(null);
    setAccount(null);
    setTransactions([]);
  }, []);

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const headers = { Authorization: `Bearer ${token}` };

      const resAcc = await fetch('http://localhost:5000/api/accounts/me', { headers });
      const dataAcc = await resAcc.json();
      if (resAcc.ok) {
        setAccount(dataAcc);
        setEditName(dataAcc.full_name || '');
      } else {
        handleLogout();
        return;
      }

      const resTx = await fetch('http://localhost:5000/api/accounts/transactions', { headers });
      const dataTx = await resTx.json();
      if (resTx.ok) {
        setTransactions(dataTx);
      }
    } catch (err) {
      console.error(err);
    }
  }, [token, handleLogout]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Tự động tra cứu tên chủ tài khoản nhận khi gõ đủ 10 chữ số
  useEffect(() => {
    const cleanAcc = toAccount.trim();
    setRecipientName('');
    setLookupError('');

    if (cleanAcc.length !== 10 || !token) return;

    if (account && cleanAcc === account.account_number) {
      setLookupError('Không thể tự chuyển tiền cho số tài khoản của chính mình!');
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`http://localhost:5000/api/accounts/lookup/${cleanAcc}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) {
          setRecipientName(data.full_name);
        } else {
          setLookupError(data.message || 'Không tìm thấy tài khoản nhận!');
        }
      } catch {
        setLookupError('Lỗi kết nối khi tra cứu tài khoản!');
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [toAccount, token, account]);

  const formattedBalance = useMemo(() => {
    if (!account) return '0 VND';
    return Number(account.balance).toLocaleString('vi-VN') + ' ' + account.currency;
  }, [account]);

  // Phân loại giao dịch Tiền vào (+) hay Tiền ra (-)
  const isIncomingTransaction = useCallback(
    (tx) => {
      if (!account) return false;
      if (tx.type === 'deposit') return true;
      if (tx.type === 'withdraw') return false;
      return tx.to_account_id?.account_number === account.account_number;
    },
    [account]
  );

  const filteredTransactions = useMemo(() => {
    if (!account) return [];
    return transactions.filter((tx) => {
      const isIncoming = isIncomingTransaction(tx);

      if (filterType === 'in' && !isIncoming) return false;
      if (filterType === 'out' && isIncoming) return false;

      if (searchTerm.trim()) {
        const keyword = searchTerm.toLowerCase();
        const partnerName = isIncoming
          ? tx.from_account_id?.user_id?.full_name || ''
          : tx.to_account_id?.user_id?.full_name || '';
        const partnerAcc = isIncoming
          ? tx.from_account_id?.account_number || ''
          : tx.to_account_id?.account_number || '';
        const desc = tx.description || '';

        return (
          partnerName.toLowerCase().includes(keyword) ||
          partnerAcc.toLowerCase().includes(keyword) ||
          desc.toLowerCase().includes(keyword)
        );
      }

      return true;
    });
  }, [transactions, account, filterType, searchTerm, isIncomingTransaction]);

  // 1. Xử lý Chuyển khoản nội bộ
  const handleTransfer = async (e) => {
    e.preventDefault();
    setLoadingTransfer(true);
    setTransferMsg(null);

    try {
      const res = await fetch('http://localhost:5000/api/accounts/transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          to_account_number: toAccount.trim(),
          amount: Number(amount),
          description,
          idempotency_key: idempotencyKey,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      setTransferMsg({ type: 'success', text: 'Chuyển tiền thành công!' });
      setToAccount('');
      setRecipientName('');
      setAmount('');
      setDescription('');
      setIdempotencyKey(generateUUID());
      fetchData();
    } catch (err) {
      setTransferMsg({ type: 'error', text: err.message });
    } finally {
      setLoadingTransfer(false);
    }
  };

  // 2. Xử lý Nạp / Rút tiền mặt
  const handleCashSubmit = async (e) => {
    e.preventDefault();
    setLoadingCash(true);
    setCashMsg(null);

    try {
      const endpoint =
        cashType === 'deposit'
          ? 'http://localhost:5000/api/accounts/deposit'
          : 'http://localhost:5000/api/accounts/withdraw';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: Number(cashAmount),
          description:
            cashDesc || (cashType === 'deposit' ? 'Nạp tiền trực tuyến' : 'Rút tiền trực tuyến'),
          idempotency_key: idempotencyKey,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      setCashMsg({ type: 'success', text: data.message });
      setCashAmount('');
      setCashDesc('');
      setIdempotencyKey(generateUUID());
      fetchData();
    } catch (err) {
      setCashMsg({ type: 'error', text: err.message });
    } finally {
      setLoadingCash(false);
    }
  };

  // 3. Xử lý Cập nhật họ tên (PATCH /api/auth/profile)
  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setProfileMsg(null);
    try {
      const res = await fetch('http://localhost:5000/api/auth/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ full_name: editName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setProfileMsg({ type: 'success', text: data.message });
      fetchData();
    } catch (err) {
      setProfileMsg({ type: 'error', text: err.message });
    }
  };

  // 4. Xử lý Đổi mật khẩu (PUT /api/auth/change-password)
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setProfileMsg(null);
    try {
      const res = await fetch('http://localhost:5000/api/auth/change-password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setProfileMsg({ type: 'success', text: data.message });
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setProfileMsg({ type: 'error', text: err.message });
    }
  };

  if (!token) {
    return isRegistering ? (
      <Register onSwitchToLogin={() => setIsRegistering(false)} />
    ) : (
      <Login
        onLoginSuccess={(newToken) => setToken(newToken)}
        onSwitchToRegister={() => setIsRegistering(true)}
      />
    );
  }

  return (
    <div className="app-container">
      {/* Header */}
      <div className="header">
        <h2>SB Bank - Ngân hàng online</h2>
        <button onClick={handleLogout} className="btn-logout">
          Đăng xuất
        </button>
      </div>

      {account ? (
        <>
          {/* Thẻ Thông tin tài khoản */}
          <div className="account-card">
            <h3>Xin chào, {account.full_name}</h3>
            <p style={{ marginTop: 8 }}>Email: {account.email}</p>
            <p>
              Số tài khoản: <strong>{account.account_number}</strong>
            </p>
            <p style={{ marginBottom: 0 }}>
              Số dư khả dụng: <strong className="balance-text">{formattedBalance}</strong>
            </p>
          </div>

          {/* Thanh điều hướng chức năng (Chuyển tiền | Nạp/Rút | Hồ sơ) */}
          <div className="nav-tabs">
            <button
              type="button"
              className={activeTab === 'transfer' ? 'nav-btn active' : 'nav-btn'}
              onClick={() => setActiveTab('transfer')}
            >
              Chuyển khoản
            </button>
            <button
              type="button"
              className={activeTab === 'cash' ? 'nav-btn active' : 'nav-btn'}
              onClick={() => setActiveTab('cash')}
            >
              Nạp / Rút tiền
            </button>
            <button
              type="button"
              className={activeTab === 'profile' ? 'nav-btn active' : 'nav-btn'}
              onClick={() => setActiveTab('profile')}
            >
              Hồ sơ & Bảo mật
            </button>
          </div>

          {/* TAB 1: Chuyển tiền nội bộ */}
          {activeTab === 'transfer' && (
            <div className="transfer-box">
              <h3>Chuyển tiền nội bộ</h3>
              {transferMsg && (
                <p className={transferMsg.type === 'success' ? 'msg-success' : 'msg-error'}>
                  {transferMsg.text}
                </p>
              )}
              <form onSubmit={handleTransfer}>
                <div className="form-group">
                  <label>Số tài khoản nhận (10 chữ số):</label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    placeholder="Nhập 10 chữ số tài khoản..."
                    value={toAccount}
                    onChange={(e) => setToAccount(e.target.value)}
                  />
                  {recipientName && (
                    <small className="lookup-success">
                      Chủ tài khoản nhận: <strong>{recipientName.toUpperCase()}</strong>
                    </small>
                  )}
                  {lookupError && <small className="lookup-error">{lookupError}</small>}
                </div>

                <div className="form-group">
                  <label>Số tiền (VND):</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="Nhập số tiền cần chuyển..."
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Nội dung chuyển tiền:</label>
                  <input
                    type="text"
                    placeholder="Chuyển tiền nội bộ..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loadingTransfer || Boolean(lookupError)}
                  className="btn-submit"
                >
                  {loadingTransfer ? 'Đang xử lý...' : 'Thực hiện chuyển tiền'}
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: Nạp / Rút tiền trực tuyến */}
          {activeTab === 'cash' && (
            <div className="transfer-box">
              <h3>Giao dịch Nạp / Rút tiền</h3>
              {cashMsg && (
                <p className={cashMsg.type === 'success' ? 'msg-success' : 'msg-error'}>
                  {cashMsg.text}
                </p>
              )}
              <div className="filter-tabs" style={{ marginBottom: 14 }}>
                <button
                  type="button"
                  className={cashType === 'deposit' ? 'tab-btn active' : 'tab-btn'}
                  onClick={() => setCashType('deposit')}
                >
                  + Nạp tiền (Deposit)
                </button>
                <button
                  type="button"
                  className={cashType === 'withdraw' ? 'tab-btn active' : 'tab-btn'}
                  onClick={() => setCashType('withdraw')}
                >
                  - Rút tiền (Withdraw)
                </button>
              </div>
              <form onSubmit={handleCashSubmit}>
                <div className="form-group">
                  <label>Số tiền {cashType === 'deposit' ? 'nạp' : 'rút'} (VND):</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="Ví dụ: 500000"
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Ghi chú giao dịch:</label>
                  <input
                    type="text"
                    placeholder={
                      cashType === 'deposit' ? 'Nạp tiền vào tài khoản...' : 'Rút tiền mặt...'
                    }
                    value={cashDesc}
                    onChange={(e) => setCashDesc(e.target.value)}
                  />
                </div>
                <button type="submit" disabled={loadingCash} className="btn-submit">
                  {loadingCash
                    ? 'Đang xử lý...'
                    : cashType === 'deposit'
                      ? 'Xác nhận Nạp tiền'
                      : 'Xác nhận Rút tiền'}
                </button>
              </form>
            </div>
          )}

          {/* TAB 3: Cập nhật Hồ sơ (PATCH) & Đổi mật khẩu (PUT) */}
          {activeTab === 'profile' && (
            <div className="transfer-box">
              <h3>Quản lý Hồ sơ & Bảo mật</h3>
              {profileMsg && (
                <p className={profileMsg.type === 'success' ? 'msg-success' : 'msg-error'}>
                  {profileMsg.text}
                </p>
              )}
              <form onSubmit={handleUpdateProfile} style={{ marginBottom: 20 }}>
                <div className="form-group">
                  <label>Họ và tên chủ tài khoản:</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn-submit">
                  Cập nhật Họ tên (PATCH)
                </button>
              </form>

              <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '16px 0' }} />

              <form onSubmit={handleChangePassword}>
                <div className="form-group">
                  <label>Mật khẩu hiện tại:</label>
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Mật khẩu mới (tối thiểu 6 ký tự):</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn-submit" style={{ backgroundColor: '#2e7d32' }}>
                  Đổi mật khẩu (PUT)
                </button>
              </form>
            </div>
          )}

          {/* Lịch sử giao dịch có Bộ lọc & Tìm kiếm */}
          <div className="history-box">
            <h3>Lịch sử giao dịch</h3>

            <div className="filter-bar">
              <div className="filter-tabs">
                <button
                  type="button"
                  className={filterType === 'all' ? 'tab-btn active' : 'tab-btn'}
                  onClick={() => setFilterType('all')}
                >
                  Tất cả
                </button>
                <button
                  type="button"
                  className={filterType === 'in' ? 'tab-btn active' : 'tab-btn'}
                  onClick={() => setFilterType('in')}
                >
                  Tiền vào (+)
                </button>
                <button
                  type="button"
                  className={filterType === 'out' ? 'tab-btn active' : 'tab-btn'}
                  onClick={() => setFilterType('out')}
                >
                  Tiền ra (-)
                </button>
              </div>

              <input
                type="text"
                className="search-input"
                placeholder="Tìm theo tên, số TK, nội dung..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {filteredTransactions.length === 0 ? (
              <p style={{ color: '#666' }}>Không có giao dịch nào phù hợp.</p>
            ) : (
              <ul className="history-list">
                {filteredTransactions.map((tx) => {
                  const isIncoming = isIncomingTransaction(tx);
                  const timeStr = tx.createdAt
                    ? new Date(tx.createdAt).toLocaleString('vi-VN')
                    : '';

                  let titleText = '';
                  if (tx.type === 'deposit') {
                    titleText = 'Nạp tiền trực tuyến vào tài khoản';
                  } else if (tx.type === 'withdraw') {
                    titleText = 'Rút tiền trực tuyến khỏi tài khoản';
                  } else if (isIncoming) {
                    titleText = `Từ: ${tx.from_account_id?.user_id?.full_name || 'N/A'} (${tx.from_account_id?.account_number || ''})`;
                  } else {
                    titleText = `Đến: ${tx.to_account_id?.user_id?.full_name || 'N/A'} (${tx.to_account_id?.account_number || ''})`;
                  }

                  return (
                    <li key={tx._id} className="history-item">
                      <div>
                        <p>{titleText}</p>
                        <small style={{ color: '#666', display: 'block' }}>{tx.description}</small>
                        {timeStr && (
                          <small style={{ color: '#94a3b8', fontSize: 12 }}>{timeStr}</small>
                        )}
                      </div>
                      <div className={isIncoming ? 'amount-receive' : 'amount-send'}>
                        {isIncoming ? '+' : '-'}
                        {Number(tx.amount).toLocaleString('vi-VN')} VND
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : (
        <p style={{ marginTop: 20 }}>Đang tải thông tin tài khoản...</p>
      )}
    </div>
  );
}

export default App;