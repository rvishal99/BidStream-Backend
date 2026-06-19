import User from '../models/User.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';

export const getUserProfile = asyncHandler(async (req, res) => {
  const userId = req.params.userId || req.user?._id;

  if (!userId) {
    throw new AppError('User ID not provided', 400);
  }

  const user = await User.findById(userId)
    .select('-refreshToken -password');

  if (!user) {
    throw new AppError('User not found', 404);
  }

  res.json({
    success: true,
    data: { user }
  });
});

export const updateUserProfile = asyncHandler(async (req, res) => {
  const { displayName, bio, avatar } = req.body;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { displayName, bio, avatar },
    { new: true, runValidators: true }
  ).select('-refreshToken -password');

  if (!user) {
    throw new AppError('User not found', 404);
  }

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: { user }
  });
});

export const getUserListings = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.userId)
    .populate('listings')
    .select('listings');

  if (!user) {
    throw new AppError('User not found', 404);
  }

  res.json({
    success: true,
    data: { listings: user.listings }
  });
});

export const getUserBids = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.userId)
    .populate({
      path: 'bids',
      populate: {
        path: 'auction',
        select: 'title currentPrice images endTime status'
      }
    })
    .select('bids');

  if (!user) {
    throw new AppError('User not found', 404);
  }

  res.json({
    success: true,
    data: { bids: user.bids }
  });
});