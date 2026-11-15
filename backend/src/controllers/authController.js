const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Account = require('../models/Account');

// Hàm sinh số tài khoản ngẫu nhiên dạng 10 chữ số
const generateAccountNumber = () => {
  return '10' + Math.floor(10000000 + Math.random() * 90000000);
};

// [API 1] POST /api/auth/register - Đăng ký tài khoản mới
exports.register = async (req, res) => {
  try {
    const { full_name, email, password } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin!' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email này đã được sử dụng!' });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const newUser = new User({
      full_name,
      email,
      password_hash,
    });
    await newUser.save();

    const newAccount = new Account({
      user_id: newUser._id,
      account_number: generateAccountNumber(),
      balance: 10000000, // Tặng sẵn 10 triệu để thực hành giao dịch
    });
    await newAccount.save();

    return res.status(201).json({
      message: 'Đăng ký tài khoản thành công!',
      account_number: newAccount.account_number,
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ message: 'Lỗi server khi đăng ký!' });
  }
};

// [API 2] POST /api/auth/login - Đăng nhập cấp phát JWT
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Vui lòng nhập email và mật khẩu!' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Email hoặc mật khẩu không chính xác!' });
    }

    if (user.status === 'locked') {
      return res.status(403).json({ message: 'Tài khoản của bạn đã bị khóa!' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Email hoặc mật khẩu không chính xác!' });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET || 'banking_secret_key_123',
      { expiresIn: '1d' }
    );

    return res.status(200).json({
      message: 'Đăng nhập thành công!',
      token,
      user: {
        id: user._id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Lỗi server khi đăng nhập!' });
  }
};

// [API 3] GET /api/auth/profile - Xem hồ sơ cá nhân hiện tại
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password_hash');
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng!' });
    }
    return res.status(200).json(user);
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({ message: 'Lỗi khi tải hồ sơ cá nhân!' });
  }
};

// [API 4] PATCH /api/auth/profile - Cập nhật họ tên hồ sơ cá nhân
exports.updateProfile = async (req, res) => {
  try {
    const { full_name } = req.body;
    if (!full_name || !full_name.trim()) {
      return res.status(400).json({ message: 'Họ và tên không được để trống!' });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { full_name: full_name.trim() },
      { new: true }
    ).select('-password_hash');

    return res.status(200).json({
      message: 'Cập nhật hồ sơ thành công!',
      user: updatedUser,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ message: 'Lỗi khi cập nhật hồ sơ!' });
  }
};

// [API 5] PUT /api/auth/change-password - Đổi mật khẩu tài khoản
exports.changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password || new_password.length < 6) {
      return res
        .status(400)
        .json({ message: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới (tối thiểu 6 ký tự)!' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng!' });
    }

    const isMatch = await bcrypt.compare(current_password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Mật khẩu hiện tại không chính xác!' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password_hash = await bcrypt.hash(new_password, salt);
    await user.save();

    return res.status(200).json({ message: 'Đổi mật khẩu thành công!' });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ message: 'Lỗi khi đổi mật khẩu!' });
  }
};