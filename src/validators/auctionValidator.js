import { z } from 'zod';

export const createAuctionSchema = z.object({
  title: z.string()
    .min(5, 'Title must be at least 5 characters')
    .max(200, 'Title must be at most 200 characters'),
  description: z.string()
    .min(20, 'Description must be at least 20 characters')
    .max(5000, 'Description must be at most 5000 characters'),
  startingPrice: z.coerce.number()
    .min(0.01, 'Starting price must be at least 0.01'),
  minBidIncrement: z.coerce.number()
    .min(0.01, 'Minimum bid increment must be at least 0.01')
    .optional()
    .default(1),
  category: z.enum(['electronics', 'fashion', 'art', 'collectibles', 'vehicles', 'home', 'sports', 'other']),
  condition: z.enum(['new', 'like_new', 'good', 'fair', 'poor'])
    .optional()
    .default('good'),
  startTime: z.string().transform((str) => new Date(str)),
  endTime: z.string().transform((str) => new Date(str)),
  images: z.array(z.string()).optional()
});

export const updateAuctionSchema = z.object({
  title: z.string()
    .min(5, 'Title must be at least 5 characters')
    .max(200, 'Title must be at most 200 characters')
    .optional(),
  description: z.string()
    .min(20, 'Description must be at least 20 characters')
    .max(5000, 'Description must be at most 5000 characters')
    .optional(),
  category: z.enum(['electronics', 'fashion', 'art', 'collectibles', 'vehicles', 'home', 'sports', 'other'])
    .optional(),
  condition: z.enum(['new', 'like_new', 'good', 'fair', 'poor'])
    .optional(),
  images: z.array(z.string()).optional()
});

export const auctionQuerySchema = z.object({
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(10),
  category: z.enum(['', 'electronics', 'fashion', 'art', 'collectibles', 'vehicles', 'home', 'sports', 'other']).optional(),
  status: z.enum(['draft', 'scheduled', 'active', 'ended', 'cancelled', 'sold']).optional(),
  seller: z.string().optional(),
  sortBy: z.enum(['createdAt', 'currentPrice', 'endTime', 'bidCount']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  search: z.string().optional()
});

export const placeBidSchema = z.object({
  amount: z.number().min(0.01, 'Bid amount must be at least 0.01')
});