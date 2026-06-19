import { AppError } from '../middleware/errorHandler.js';

const VALID_TRANSITIONS = {
  draft: ['scheduled', 'active', 'cancelled'],
  scheduled: ['active', 'cancelled'],
  active: ['ended', 'sold', 'cancelled'],
  ended: ['sold'],
  cancelled: [],
  sold: []
};

export const canTransition = (currentStatus, newStatus) => {
  return VALID_TRANSITIONS[currentStatus]?.includes(newStatus) || false;
};

export const validateTransition = (currentStatus, newStatus) => {
  if (!canTransition(currentStatus, newStatus)) {
    throw new AppError(
      `Invalid state transition from '${currentStatus}' to '${newStatus}'`,
      400
    );
  }
};

export const getNextState = (currentStatus, trigger) => {
  const stateMap = {
    draft: {
      publish: 'active',
      schedule: 'scheduled',
      cancel: 'cancelled'
    },
    scheduled: {
      start: 'active',
      cancel: 'cancelled'
    },
    active: {
      end: 'ended',
      sold: 'sold',
      cancel: 'cancelled'
    },
    ended: {
      complete: 'sold'
    }
  };

  const nextStatus = stateMap[currentStatus]?.[trigger];
  if (!nextStatus) {
    throw new AppError(
      `No valid transition for '${currentStatus}' with trigger '${trigger}'`,
      400
    );
  }
  return nextStatus;
};

export const checkAndUpdateAuctionState = (auction) => {
  const now = new Date();

  if (auction.status === 'scheduled' && now >= auction.startTime) {
    return 'active';
  }

  if (auction.status === 'active' && now > auction.endTime) {
    return 'ended';
  }

  return null;
};

export const STATE_DESCRIPTIONS = {
  draft: 'Auction is being prepared, not visible to public',
  scheduled: 'Auction is scheduled to start at a future time',
  active: 'Auction is live and accepting bids',
  ended: 'Auction has ended, waiting for payment',
  sold: 'Auction completed and paid',
  cancelled: 'Auction was cancelled'
};