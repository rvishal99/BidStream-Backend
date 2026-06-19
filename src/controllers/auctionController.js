import fs from 'fs';
import Auction from '../models/Auction.js';
import Bid from '../models/Bid.js';
import User from '../models/User.js';
import Order from '../models/Order.js';
import Notification from '../models/Notification.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { getBid, setBid, deleteBid, acquireLock, releaseLock, invalidateAuctionCache } from '../utils/redisHelpers.js';
import { validateTransition, checkAndUpdateAuctionState, getNextState } from '../utils/auctionStateMachine.js';
import { scheduleAuctionClose, closeAuction } from '../config/queue.js';
import cloudinary from '../config/cloudinary.js';

const uploadAuctionImages = async (files = []) => {
  const urls = [];
  for (const file of files) {
    try {
      const result = await cloudinary.uploader.upload(file.path, { folder: 'auctions' });
      urls.push(result.secure_url);
    } finally {
      fs.unlink(file.path, () => {});
    }
  }
  return urls;
};

export const createAuction = asyncHandler(async (req, res) => {
  const { title, description, startingPrice, minBidIncrement, category, condition, startTime, endTime, reservePrice } = req.body;

  if (new Date(startTime) < new Date()) {
    throw new AppError('Start time must be in the future', 400);
  }

  if (new Date(endTime) <= new Date(startTime)) {
    throw new AppError('End time must be after start time', 400);
  }

  const minDuration = 1 * 60 * 60 * 1000; // 1 hour
  const maxDuration = 30 * 24 * 60 * 60 * 1000; // 30 days

  const duration = new Date(endTime) - new Date(startTime);
  if (duration < minDuration) {
    throw new AppError('Auction duration must be at least 1 hour', 400);
  }
  if (duration > maxDuration) {
    throw new AppError('Auction duration cannot exceed 30 days', 400);
  }

  const images = await uploadAuctionImages(req.files);

  const auction = await Auction.create({
    title,
    description,
    startingPrice,
    minBidIncrement: minBidIncrement || 1,
    category,
    condition: condition || 'good',
    startTime,
    endTime,
    images,
    seller: req.user._id,
    currentPrice: startingPrice,
    status: 'scheduled',
    reservePrice: reservePrice || null
  });

  await User.findByIdAndUpdate(req.user._id, {
    $push: { listings: auction._id }
  });

  // Cache initial bid in Redis
  await setBid(auction._id.toString(), startingPrice);

  // Schedule close auction job
  scheduleAuctionClose(auction._id.toString(), endTime);

  res.status(201).json({
    success: true,
    message: 'Auction created successfully',
    data: { auction }
  });
});

export const getAuctions = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    category,
    status,
    seller,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    search
  } = req.query;

  const query = {};

  if (category) query.category = category;

  if (status) {
    if (status === 'active') {
      query.status = 'active';
      query.startTime = { $lte: new Date() };
      query.endTime = { $gte: new Date() };
    } else {
      query.status = status;
    }
  } else {
    query.status = { $in: ['active', 'scheduled'] };
  }

  if (seller) query.seller = seller;

  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }

  const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

  const total = await Auction.countDocuments(query);

  const auctions = await Auction.find(query)
    .populate('seller', 'username displayName avatar')
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  res.json({
    success: true,
    data: {
      auctions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

export const getAuctionById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  let auction = await Auction.findById(id)
    .populate('seller', 'username displayName avatar')
    .populate('winner', 'username displayName avatar');

  if (!auction) {
    throw new AppError('Auction not found', 404);
  }

  const stateUpdate = checkAndUpdateAuctionState(auction);
  if (stateUpdate && stateUpdate !== auction.status) {
    if (stateUpdate === 'ended') {
      // Settle the auction (winner determination, order, notifications) in
      // case the Bull/Redis job hasn't run yet — see closeAuction in queue.js.
      await closeAuction(auction._id);
      auction = await Auction.findById(id)
        .populate('seller', 'username displayName avatar')
        .populate('winner', 'username displayName avatar');
    } else {
      auction.status = stateUpdate;
      await auction.save();
    }
  }

  const cachedBid = await getBid(id);
  if (cachedBid !== null && auction.currentPrice !== cachedBid) {
    auction.currentPrice = cachedBid;
  }

  const highestBid = await Bid.findOne({ auction: id, isWinning: true })
    .populate('bidder', 'username displayName');

  const bids = await Bid.find({ auction: id })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate('bidder', 'username displayName');

  res.json({
    success: true,
    data: {
      auction,
      highestBid,
      recentBids: bids
    }
  });
});

export const updateAuction = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, description, category, condition, images } = req.body;

  const auction = await Auction.findById(id);

  if (!auction) {
    throw new AppError('Auction not found', 404);
  }

  if (auction.seller.toString() !== req.user._id.toString()) {
    throw new AppError('You can only update your own auctions', 403);
  }

  if (!['draft', 'scheduled'].includes(auction.status)) {
    throw new AppError('Can only update auctions in draft or scheduled state', 400);
  }

  const updatedAuction = await Auction.findByIdAndUpdate(
    id,
    { title, description, category, condition, images },
    { new: true, runValidators: true }
  ).populate('seller', 'username displayName avatar');

  await invalidateAuctionCache(id);

  res.json({
    success: true,
    message: 'Auction updated successfully',
    data: { auction: updatedAuction }
  });
});

export const deleteAuction = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const auction = await Auction.findById(id);

  if (!auction) {
    throw new AppError('Auction not found', 404);
  }

  if (auction.seller.toString() !== req.user._id.toString()) {
    throw new AppError('You can only delete your own auctions', 403);
  }

  if (auction.status === 'active' || auction.status === 'ended') {
    throw new AppError('Cannot delete active or ended auctions', 400);
  }

  await Auction.findByIdAndDelete(id);

  await User.findByIdAndUpdate(req.user._id, {
    $pull: { listings: id }
  });

  await deleteBid(id);
  await invalidateAuctionCache(id);

  res.json({
    success: true,
    message: 'Auction deleted successfully'
  });
});

export const publishAuction = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const auction = await Auction.findById(id);

  if (!auction) {
    throw new AppError('Auction not found', 404);
  }

  if (auction.seller.toString() !== req.user._id.toString()) {
    throw new AppError('You can only publish your own auctions', 403);
  }

  const newStatus = new Date(auction.startTime) <= new Date() ? 'active' : 'scheduled';
  validateTransition(auction.status, newStatus);

  auction.status = newStatus;
  await auction.save();
  await invalidateAuctionCache(id);

  res.json({
    success: true,
    message: `Auction ${auction.status === 'active' ? 'published' : 'scheduled'} successfully`,
    data: { auction }
  });
});

export const endAuction = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const auction = await Auction.findById(id).populate('seller', 'username email');

  if (!auction) {
    throw new AppError('Auction not found', 404);
  }

  if (auction.seller._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    throw new AppError('Only the seller or admin can end this auction', 403);
  }

  validateTransition(auction.status, 'ended');

  auction.status = 'ended';
  await auction.save();

  const winningBid = await Bid.findOne({ auction: id, isWinning: true })
    .populate('bidder', 'username email');

  if (winningBid) {
    auction.winner = winningBid.bidder._id;
    auction.status = 'sold';
    await auction.save();

    await Order.create({
      buyer: winningBid.bidder._id,
      seller: auction.seller._id,
      auction: auction._id,
      bid: winningBid._id,
      amount: winningBid.amount,
      status: 'pending'
    });

    await Notification.create({
      user: winningBid.bidder._id,
      type: 'auction_won',
      title: 'Congratulations! You won the auction',
      message: `You won "${auction.title}" for $${winningBid.amount}`,
      relatedAuction: auction._id
    });

    await Notification.create({
      user: auction.seller._id,
      type: 'auction_ended',
      title: 'Your auction has ended',
      message: `"${auction.title}" sold for $${winningBid.amount}`,
      relatedAuction: auction._id
    });
  }

  await invalidateAuctionCache(id);

  res.json({
    success: true,
    message: 'Auction ended successfully',
    data: { auction, winningBid }
  });
});

export const getMyAuctions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;

  const query = { seller: req.user._id };

  const total = await Auction.countDocuments(query);

  const auctions = await Auction.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  res.json({
    success: true,
    data: {
      auctions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

export const getWatchedAuctions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;

  const auction = await Auction.find({
    watchers: req.user._id,
    status: { $in: ['active', 'scheduled'] }
  })
    .populate('seller', 'username displayName')
    .sort({ endTime: 1 });

  const total = auction.length;
  const paginatedAuctions = auction.slice((page - 1) * limit, page * limit);

  res.json({
    success: true,
    data: {
      auctions: paginatedAuctions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

export const watchAuction = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const auction = await Auction.findById(id);

  if (!auction) {
    throw new AppError('Auction not found', 404);
  }

  if (!auction.watchers.includes(req.user._id)) {
    auction.watchers.push(req.user._id);
    await auction.save();
  }

  res.json({
    success: true,
    message: 'Auction added to watchlist',
    data: { auction }
  });
});

export const unwatchAuction = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const auction = await Auction.findById(id);

  if (!auction) {
    throw new AppError('Auction not found', 404);
  }

  if (!auction.watchers.includes(req.user._id)) {
    throw new AppError('You are not watching this auction', 400);
  }

  auction.watchers = auction.watchers.filter(
    watcher => watcher.toString() !== req.user._id.toString()
  );
  await auction.save();

  res.json({
    success: true,
    message: 'Auction removed from watchlist'
  });
});