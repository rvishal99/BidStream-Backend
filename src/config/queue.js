import Bull from 'bull';
import { getIO, notifyWinner, broadcastAuctionUpdate, notifyOutbid } from './socket.js';
import Auction from '../models/Auction.js';
import Bid from '../models/Bid.js';
import User from '../models/User.js';
import Order from '../models/Order.js';
import Notification from '../models/Notification.js';

// Create queues
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const closeAuctionQueue = new Bull('close-auction', redisUrl, {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: true,
    removeOnFail: false
  }
});

export const notifyWinnerQueue = new Bull('notify-winner', redisUrl, {
  defaultJobOptions: {
    attempts: 2,
    removeOnComplete: true,
    removeOnFail: false
  }
});

export const sendEmailQueue = new Bull('send-email', redisUrl, {
  defaultJobOptions: {
    attempts: 3,
    removeOnComplete: true
  }
});

// ======================
// Close Auction Job
// ======================

// Settles an auction: determines the winner (or lack thereof) and persists
// the result. Shared by the Bull job below and by the passive time-based
// check in getAuctionById, since whichever runs first must "win" — Redis/Bull
// may not be running, so the passive path can't just flip status to 'ended'
// without also running this, or the winner would never get declared.
export const closeAuction = async (auctionId) => {
  console.log(`Processing closeAuction for auction: ${auctionId}`);

  const auction = await Auction.findById(auctionId);

  if (!auction) {
    console.log(`Auction ${auctionId} not found, skipping`);
    return;
  }

  // Check if already processed
  if (auction.status === 'ended' || auction.status === 'sold' || auction.status === 'cancelled') {
    console.log(`Auction ${auctionId} already ${auction.status}, skipping`);
    return;
  }

  // Find highest bid
  const highestBid = await Bid.findOne({ auction: auctionId })
    .sort({ amount: -1 })
    .populate('bidder', 'username email');

  // Determine if auction met reserve price
  const metReserve = !auction.reservePrice || (highestBid && highestBid.amount >= auction.reservePrice);

  if (highestBid && metReserve) {
    // Auction sold
    auction.status = 'sold';
    auction.winner = highestBid.bidder._id;
    await auction.save();

    // Create notification for winner
    const winnerNotification = await Notification.create({
      user: highestBid.bidder._id,
      type: 'auction_won',
      title: 'Congratulations! You won the auction',
      message: `You won "${auction.title}" for $${highestBid.amount}`,
      relatedAuction: auctionId,
      data: { finalPrice: highestBid.amount }
    });

    // Create notification for seller
    await Notification.create({
      user: auction.seller,
      type: 'auction_ended',
      title: 'Your auction has sold!',
      message: `"${auction.title}" sold for $${highestBid.amount}`,
      relatedAuction: auctionId,
      data: { finalPrice: highestBid.amount, winnerId: highestBid.bidder._id }
    });

    // Create order
    const order = await Order.create({
      buyer: highestBid.bidder._id,
      seller: auction.seller,
      auction: auctionId,
      bid: highestBid._id,
      amount: highestBid.amount,
      status: 'pending'
    });

    // Queue winner notification
    await notifyWinnerQueue.add({
      auctionId,
      winnerId: highestBid.bidder._id.toString(),
      title: auction.title,
      amount: highestBid.amount,
      orderId: order._id
    });

    // Broadcast to socket
    broadcastAuctionUpdate(auctionId, {
      status: 'sold',
      winner: {
        id: highestBid.bidder._id,
        username: highestBid.bidder.username
      },
      finalPrice: highestBid.amount
    });

    notifyWinner(auctionId, highestBid.bidder._id.toString(), {
      auctionId,
      title: auction.title,
      amount: highestBid.amount,
      orderId: order._id
    });

    console.log(`Auction ${auctionId} SOLD to ${highestBid.bidder.username} for $${highestBid.amount}`);

    return { status: 'sold', winner: highestBid.bidder.username, amount: highestBid.amount };
  } else {
    // Auction ended without winning bid or reserve not met
    auction.status = 'ended';
    await auction.save();

    // Notify seller
    await Notification.create({
      user: auction.seller,
      type: 'auction_ended',
      title: 'Your auction has ended',
      message: highestBid
        ? `"${auction.title}" ended with highest bid of $${highestBid.amount} (reserve not met)`
        : `"${auction.title}" ended with no bids`,
      relatedAuction: auctionId
    });

    // Broadcast to socket
    broadcastAuctionUpdate(auctionId, {
      status: 'ended',
      highestBid: highestBid ? highestBid.amount : null
    });

    console.log(`Auction ${auctionId} ENDED (no winner)`);

    return { status: 'ended', highestBid: highestBid?.amount || 0 };
  }
};

closeAuctionQueue.process(async (job) => {
  return closeAuction(job.data.auctionId);
});

// ======================
// Notify Winner Job
// ======================

notifyWinnerQueue.process(async (job) => {
  const { auctionId, winnerId, title, amount, orderId } = job.data;
  console.log(`Notifying winner ${winnerId} about auction ${auctionId}`);

  
  // await sendEmail(winnerId, 'auction_won', { title, amount, orderId });

  console.log(`Winner notification sent for auction ${auctionId}`);

  return { notified: true };
});

// ======================
// Send Email Job (Placeholder)
// ======================

sendEmailQueue.process(async (job) => {
  const { to, template, data } = job.data;
  console.log(`Sending email to ${to}, template: ${template}`);

  
  // await emailService.send({ to, template, data });

  return { sent: true };
});

// ======================
// Helper Functions
// ======================

export const scheduleAuctionClose = (auctionId, endTime) => {
  const delay = new Date(endTime).getTime() - Date.now();

  if (delay > 0) {
    closeAuctionQueue.add(
      { auctionId },
      {
        delay,
        jobId: `close-auction-${auctionId}`
      }
    );
    console.log(`Scheduled auction ${auctionId} to close in ${Math.round(delay / 1000 / 60)} minutes`);
  } else {
    // If end time has passed, process immediately
    closeAuctionQueue.add({ auctionId });
  }
};

export const cancelScheduledAuction = (auctionId) => {
  closeAuctionQueue.removeById(`close-auction-${auctionId}`).catch(() => {
    console.log(`Job not found or already processed for auction ${auctionId}`);
  });
};

export const addNotifyJob = (data) => {
  return notifyWinnerQueue.add(data);
};

export const addEmailJob = (data) => {
  return sendEmailQueue.add(data);
};

// ======================
// Event Listeners for Monitoring
// ======================

closeAuctionQueue.on('completed', (job, result) => {
  console.log(`Close auction job ${job.id} completed:`, result);
});

closeAuctionQueue.on('failed', (job, err) => {
  console.error(`Close auction job ${job.id} failed:`, err.message);
});

notifyWinnerQueue.on('completed', (job, result) => {
  console.log(`Notify winner job ${job.id} completed:`, result);
});