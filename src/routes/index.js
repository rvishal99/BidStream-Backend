import express from 'express';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import auctionRoutes from './auctionRoutes.js';
import bidRoutes from './bidRoutes.js';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/auctions', auctionRoutes);
router.use('/bids', bidRoutes);

export default router;