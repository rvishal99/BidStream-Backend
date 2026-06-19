import express from 'express';
import {
  createAuction,
  getAuctions,
  getAuctionById,
  updateAuction,
  deleteAuction,
  publishAuction,
  endAuction,
  getMyAuctions,
  getWatchedAuctions,
  watchAuction,
  unwatchAuction
} from '../controllers/auctionController.js';
import { validate } from '../middleware/validateMiddleware.js';
import { validateQuery } from '../middleware/validateMiddleware.js';
import {
  createAuctionSchema,
  updateAuctionSchema,
  auctionQuerySchema
} from '../validators/auctionValidator.js';
import { protect, optionalAuth } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimiter.js';
import { uploadMultiple } from '../upload/uploadMiddleware.js';

const router = express.Router();

router.get('/', validateQuery(auctionQuerySchema), getAuctions);
router.get('/my-auctions', protect, getMyAuctions);
router.get('/watched', protect, getWatchedAuctions);
router.get('/:id', optionalAuth, getAuctionById);

router.post('/', protect, uploadMultiple, validate(createAuctionSchema), createAuction);

router.patch('/:id', protect, validate(updateAuctionSchema), updateAuction);

router.delete('/:id', protect, deleteAuction);

router.post('/:id/publish', protect, publishAuction);
router.post('/:id/end', protect, endAuction);

router.post('/:id/watch', protect, watchAuction);
router.delete('/:id/watch', protect, unwatchAuction);

export default router;