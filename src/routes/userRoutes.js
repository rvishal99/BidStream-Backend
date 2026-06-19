import express from 'express';
import {
  getUserProfile,
  updateUserProfile,
  getUserListings,
  getUserBids
} from '../controllers/userController.js';
import { updateUserSchema } from '../validators/authValidator.js';
import { validate } from '../middleware/validateMiddleware.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.get('/profile', protect, getUserProfile);
router.patch('/profile', protect, validate(updateUserSchema), updateUserProfile);
router.get('/:userId/listings', getUserListings);
router.get('/:userId/bids', getUserBids);
router.get('/:userId', getUserProfile);

export default router;