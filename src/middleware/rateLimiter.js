import rateLimit from 'express-rate-limit';

let redisClient = null;
let redisConnected = false;

if (process.env.REDIS_URL) {
  try {
    const Redis = (await import('ioredis')).default;
    redisClient = new Redis(process.env.REDIS_URL, {
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 100, 3000);
      }
    });

    redisClient.on('error', (err) => {
      console.warn('Redis connection error:', err.message);
      redisConnected = false;
    });

    redisClient.on('connect', () => {
      redisConnected = true;
      console.log('Redis connected for rate limiting');
    });
  } catch (err) {
    console.warn('Redis not available, using in-memory store');
  }
}

const createRedisStore = (redis) => ({
  increment: async (key) => {
    try {
      const results = await redis.incr(key);
      await redis.expire(key, Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000) / 1000));
      return results || 1;
    } catch {
      return 1;
    }
  },
  decrement: async (key) => {
    try {
      await redis.decr(key);
    } catch {}
  },
  resetKey: async (key) => {
    try {
      await redis.del(key);
    } catch {}
  },
  hits: async (key) => {
    try {
      const hits = await redis.get(key);
      return hits ? parseInt(hits, 10) : 0;
    } catch {
      return 0;
    }
  }
});

const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 500,
  message: {
    success: false,
    message: 'Too many requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: redisClient ? createRedisStore(redisClient) : undefined
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: {
    success: false,
    message: 'Too many API requests, please slow down.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

export { rateLimiter, authLimiter, apiLimiter };