import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';

const generateAccessToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m'
  });
};

const generateRefreshToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  });
};

const cookieOptions = (maxAge) => ({
  httpOnly: true,
  secure: true,
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge
});

export const register = asyncHandler(async (req, res) => {
  const { username, email, password, displayName } = req.body;

  const existingUser = await User.findOne({
    $or: [{ email }, { username }]
  });

  if (existingUser) {
    throw new AppError(existingUser.email === email
      ? 'Email already registered'
      : 'Username already taken', 400);
  }

  const user = await User.create({
    username,
    email,
    password,
    displayName: displayName || username
  });

  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  user.refreshToken = refreshToken;
  await user.save();

  res.cookie('accessToken', accessToken, cookieOptions(15 * 60 * 1000));
  res.cookie('refreshToken', refreshToken, cookieOptions(7 * 24 * 60 * 60 * 1000));

  res.status(201).json({
    success: true,
    message: 'Registration successful',
    data: {
      user
    }
  });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });

  if (!user || !(await user.comparePassword(password))) {
    throw new AppError('Invalid email or password', 401);
  }

  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  user.refreshToken = refreshToken;
  await user.save();

  res.cookie('accessToken', accessToken, cookieOptions(15 * 60 * 1000));
  res.cookie('refreshToken', refreshToken, cookieOptions(7 * 24 * 60 * 60 * 1000));

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      accessToken,
      user
    }
  });
});

export const refreshToken = asyncHandler(async (req, res) => {
  const refreshToken = (req.cookies && req.cookies.refreshToken) || req.body?.refreshToken;

  if (!refreshToken) {
    throw new AppError('Refresh token not provided', 401);
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    const user = await User.findById(decoded.userId);

    if (!user || user.refreshToken !== refreshToken) {
      throw new AppError('Invalid refresh token', 401);
    }

    const newAccessToken = generateAccessToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);

    user.refreshToken = newRefreshToken;
    await user.save();

    res.cookie('accessToken', newAccessToken, cookieOptions(15 * 60 * 1000));
    res.cookie('refreshToken', newRefreshToken, cookieOptions(7 * 24 * 60 * 60 * 1000));

    res.json({
      success: true,
      data: {}
    });
  } catch (error) {
    throw new AppError('Invalid or expired refresh token', 401);
  }
});

export const logout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  if (refreshToken) {
    await User.findOneAndUpdate(
      { refreshToken },
      { refreshToken: null }
    );
  }

  res.clearCookie('refreshToken');
  res.clearCookie('accessToken');

  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

export const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  res.json({
    success: true,
    data: { user }
  });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id);

  if (!(await user.comparePassword(currentPassword))) {
    throw new AppError('Current password is incorrect', 401);
  }

  user.password = newPassword;
  await user.save();

  res.json({
    success: true,
    message: 'Password changed successfully'
  });
});