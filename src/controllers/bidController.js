import Bid from '../models/Bid.js';
import Auction from '../models/Auction.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { getBid, setBid, acquireLock, releaseLock } from '../utils/redisHelpers.js';
import { emitToAuction } from '../config/socket.js';

// Place bid via REST API
export const placeBid = asyncHandler(async (req, res) => {
  const { id: auctionId } = req.params;
  const { amount } = req.body;

  const auction = await Auction.findById(auctionId);

  if (!auction) {
    throw new AppError('Auction not found', 404);
  }

  if (auction.seller.toString() === req.user._id.toString()) {
    throw new AppError('You cannot bid on your own auction', 400);
  }

  const now = new Date();
  if (now < auction.startTime || now > auction.endTime) {
    throw new AppError('Auction is not active', 400);
  }

  if (auction.status !== 'active') {
    throw new AppError('Auction is not active for bidding', 400);
  }

  const currentPrice = await getBid(auctionId) || auction.currentPrice;
  const minBid = currentPrice + auction.minBidIncrement;

  if (amount < minBid) {
    throw new AppError(`Minimum bid is $${minBid.toFixed(2)}`, 400);
  }

  // Check if previous highest bidder is the same user
  const previousHighestBid = await Bid.findOne({ auction: auctionId, isWinning: true });
  if (previousHighestBid && previousHighestBid.bidder.toString() === req.user._id.toString()) {
    throw new AppError('You cannot place consecutive bids. Wait for another bidder to bid.', 400);
  }

  // Acquire lock with token for safe release
  const lock = await acquireLock(auctionId, 5);

  if (!lock.acquired) {
    throw new AppError('Please try again, bid in progress', 409);
  }

  try {
    // Bid placement with Redis lock
    const result = await processBidPlacement(auction, auctionId, amount, req.user._id);

    // Broadcast to all clients watching this auction
    emitToAuction(auctionId, `auction:${auctionId}:bid`, result);
    emitToAuction(auctionId, 'bidUpdated', {
      currentPrice: result.currentPrice,
      bidCount: result.bidCount,
      minNextBid: result.minNextBid
    });

    res.status(201).json({
      success: true,
      message: 'Bid placed successfully',
      data: result
    });
  } finally {
    await releaseLock(auctionId, lock.token);
  }
});

// Place bid via Socket.io
export const placeBidSocket = async (socket, auctionId, amount) => {
  if (!socket.user) {
    throw new AppError('Authentication required to place bid', 401);
  }

  const auction = await Auction.findById(auctionId);

  if (!auction) {
    throw new AppError('Auction not found', 404);
  }

  if (auction.seller.toString() === socket.user.userId) {
    throw new AppError('You cannot bid on your own auction', 400);
  }

  const now = new Date();
  if (now < auction.startTime || now > auction.endTime) {
    throw new AppError('Auction is not active', 400);
  }

  if (auction.status !== 'active') {
    throw new AppError('Auction is not active for bidding', 400);
  }

  const currentPrice = await getBid(auctionId) || auction.currentPrice;
  const minBid = currentPrice + auction.minBidIncrement;

  if (amount < minBid) {
    throw new AppError(`Minimum bid is $${minBid.toFixed(2)}`, 400);
  }

  // Check if previous highest bidder is the same user
  const previousHighestBid = await Bid.findOne({ auction: auctionId, isWinning: true });
  if (previousHighestBid && previousHighestBid.bidder.toString() === socket.user.userId) {
    throw new AppError('You cannot place consecutive bids. Wait for another bidder to bid.', 400);
  }

  // Acquire lock with token for safe release
  const lock = await acquireLock(auctionId, 5);

  if (!lock.acquired) {
    throw new AppError('Please try again, bid in progress', 409);
  }

  try {
    // Bid placement with Redis lock
    const result = await processBidPlacement(auction, auctionId, amount, socket.user.userId);

    // Broadcast to all clients watching this auction (done in socket handler)
    return result;
  } finally {
    await releaseLock(auctionId, lock.token);
  }
};

// Core bid placement logic (shared by REST and Socket)
const processBidPlacement = async (auction, auctionId, amount, userId) => {
  const previousHighestBid = await Bid.findOne({ auction: auctionId, isWinning: true })
    .populate('bidder', 'username email');

  // Notify previous bidder of outbid
  if (previousHighestBid) {
    previousHighestBid.isWinning = false;
    await previousHighestBid.save();

    if (previousHighestBid.bidder._id.toString() !== userId) {
      // Create notification
      await Notification.create({
        user: previousHighestBid.bidder._id,
        type: 'outbid',
        title: 'You have been outbid!',
        message: `Someone placed a higher bid of $${amount} on "${auction.title}"`,
        relatedAuction: auctionId
      });

      // Emit socket event
      const { notifyOutbid } = await import('../config/socket.js');
      notifyOutbid(previousHighestBid.bidder._id.toString(), {
        auctionId,
        auctionTitle: auction.title,
        newAmount: amount
      });
    }
  }

  // Create new bid
  const bid = await Bid.create({
    auction: auctionId,
    bidder: userId,
    amount,
    isWinning: true
  });

  // Update Redis cache
  await setBid(auctionId, amount);

  // Update auction in MongoDB
  auction.currentPrice = amount;
  auction.bidCount += 1;
  await auction.save();

  // Add to user's bid history
  await User.findByIdAndUpdate(userId, {
    $push: { bids: bid._id }
  });

  // Populate bid for response
  const populatedBid = await Bid.findById(bid._id)
    .populate('bidder', 'username displayName');

  return {
    bid: populatedBid,
    currentPrice: amount,
    minNextBid: amount + auction.minBidIncrement,
    bidCount: auction.bidCount
  };
};

export const getAuctionBids = asyncHandler(async (req, res) => {
  const { id: auctionId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  const auction = await Auction.findById(auctionId);

  if (!auction) {
    throw new AppError('Auction not found', 404);
  }

  const total = await Bid.countDocuments({ auction: auctionId });

  const bids = await Bid.find({ auction: auctionId })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit))
    .populate('bidder', 'username displayName avatar');

  res.json({
    success: true,
    data: {
      bids,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

export const getMyBids = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;

  const bids = await Bid.find({ bidder: req.user._id })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit))
    .populate({
      path: 'auction',
      populate: {
        path: 'seller',
        select: 'username'
      }
    });

  const total = await Bid.countDocuments({ bidder: req.user._id });

  res.json({
    success: true,
    data: {
      bids,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

export const getHighestBid = asyncHandler(async (req, res) => {
  const { id: auctionId } = req.params;

  const auction = await Auction.findById(auctionId);

  if (!auction) {
    throw new AppError('Auction not found', 404);
  }

  const cachedBid = await getBid(auctionId);

  res.json({
    success: true,
    data: {
      currentPrice: cachedBid !== null ? cachedBid : auction.currentPrice,
      bidCount: auction.bidCount,
      minBidIncrement: auction.minBidIncrement,
      minNextBid: (cachedBid !== null ? cachedBid : auction.currentPrice) + auction.minBidIncrement
    }
  });
});