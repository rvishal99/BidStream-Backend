import express from 'express';
import {
  placeBid,
  getAuctionBids,
  getMyBids,
  getHighestBid
} from '../controllers/bidController.js';
import { validate } from '../middleware/validateMiddleware.js';
import { placeBidSchema } from '../validators/auctionValidator.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/auction/:id', protect, validate(placeBidSchema), placeBid);
router.get('/auction/:id', getAuctionBids);
router.get('/auction/:id/highest', getHighestBid);
router.get('/my-bids', protect, getMyBids);

export default router;