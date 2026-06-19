import { redis } from '../config/redis.js';

// Key templates - centralized for consistency
const BID_KEY = (id) => `bid:${id}`;
const LOCK_KEY = (id) => `lock:auction:${id}`;

// ======================
// Bid Caching
// ======================

export const getBid = async (auctionId) => {
  if (!redis) return null;
  const bid = await redis.get(BID_KEY(auctionId));
  return bid ? parseFloat(bid) : null;
};

export const setBid = async (auctionId, amount) => {
  if (!redis) return;
  await redis.set(BID_KEY(auctionId), amount.toString());
};

export const deleteBid = async (auctionId) => {
  if (!redis) return;
  await redis.del(BID_KEY(auctionId));
};

// ======================
// Locking with Token Validation
// ======================

export const acquireLock = async (auctionId, ttl = 5) => {
  if (!redis) return { acquired: true, token: null };

  const lockKey = LOCK_KEY(auctionId);
  // Generate unique token for this request
  const token = `${Date.now()}-${Math.random().toString(36).substring(2)}`;

  const result = await redis.set(lockKey, token, 'EX', ttl, 'NX');

  if (result === 'OK') {
    return { acquired: true, token };
  }
  return { acquired: false, token: null };
};

export const releaseLock = async (auctionId, token) => {
  if (!redis || !token) return;

  const lockKey = LOCK_KEY(auctionId);

  // Lua script: Delete ONLY if token matches (atomic)
  const luaScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  await redis.eval(luaScript, 1, lockKey, token);
};

export const cacheAuction = async (auctionId, data, ttl = 300) => {
  if (!redis) return;
  await redis.setex(`auction:${auctionId}`, ttl, JSON.stringify(data));
};

export const getCachedAuction = async (auctionId) => {
  if (!redis) return null;
  const data = await redis.get(`auction:${auctionId}`);
  return data ? JSON.parse(data) : null;
};

export const invalidateAuctionCache = async (auctionId) => {
  if (!redis) return;
  await redis.del(`auction:${auctionId}`);
  await redis.del(`bid:${auctionId}`);
};

export const incrementViewCount = async (auctionId) => {
  if (!redis) return;
  const key = `views:${auctionId}`;
  await redis.incr(key);
};

export const getViewCount = async (auctionId) => {
  if (!redis) return 0;
  const count = await redis.get(`views:${auctionId}`);
  return parseInt(count || '0', 10);
};