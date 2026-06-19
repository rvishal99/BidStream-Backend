import Redis from 'ioredis';

const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL)
  : null;

const connectRedis = async () => {
  if (!redis) {
    console.log('Redis not configured, skipping connection');
    return;
  }
  try {
    await redis.ping();
    console.log('Redis connected successfully');
  } catch (error) {
    console.error('Redis connection failed:', error.message);
  }
};

export { redis, connectRedis };