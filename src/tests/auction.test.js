import request from 'supertest';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { createServer } from 'http';
import app from '../index.js';
import User from '../models/User.js';
import Auction from '../models/Auction.js';
import Bid from '../models/Bid.js';

dotenv.config({ path: '.env.test' });

let server;
let testUser;
let testAuction;
let authToken;

// Test data
const testUserData = {
  username: 'testuser',
  email: 'test@example.com',
  password: 'Test123!@#',
  displayName: 'Test User'
};

const testSellerData = {
  username: 'seller',
  email: 'seller@example.com',
  password: 'Seller123!@#',
  displayName: 'Test Seller'
};

const testBuyerData = {
  username: 'buyer',
  email: 'buyer@example.com',
  password: 'Buyer123!@#',
  displayName: 'Test Buyer'
};

describe('Auction Backend API Tests', () => {
  beforeAll(async () => {
    // Connect to test database
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/auction_db_test';
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    // Clean up stale data from any previous interrupted test runs
    await User.deleteMany({});
    await Auction.deleteMany({});
    await Bid.deleteMany({});

    server = createServer(app);
    await new Promise((resolve) => {
      server.listen(0, resolve);
    });
  });

  afterAll(async () => {
    // Clean up
    await User.deleteMany({});
    await Auction.deleteMany({});
    await Bid.deleteMany({});
    await mongoose.connection.close();
    server.close();
  });

  // ==================== USER AUTHENTICATION TESTS ====================

  describe('User Registration', () => {
    it('should successfully register a new user', async () => {
      const response = await request(server)
        .post('/api/v1/auth/register')
        .send(testUserData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toHaveProperty('_id');
      expect(response.body.data.user.email).toBe(testUserData.email);
      expect(response.body.data.user.username).toBe(testUserData.username);
    });

    it('should reject duplicate email registration', async () => {
      const response = await request(server)
        .post('/api/v1/auth/register')
        .send(testUserData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject invalid email format', async () => {
      const response = await request(server)
        .post('/api/v1/auth/register')
        .send({
          ...testUserData,
          email: 'invalid-email',
          username: 'newuser'
        });

      expect(response.status).toBe(400);
    });

    it('should reject weak password', async () => {
      const response = await request(server)
        .post('/api/v1/auth/register')
        .send({
          ...testUserData,
          password: '123',
          username: 'newuser2'
        });

      expect(response.status).toBe(400);
    });
  });

  describe('User Login', () => {
    beforeAll(async () => {
      // Create seller and buyer for bidding tests
      await request(server)
        .post('/api/v1/auth/register')
        .send(testSellerData);

      await request(server)
        .post('/api/v1/auth/register')
        .send(testBuyerData);
    });

    it('should successfully login with valid credentials', async () => {
      const response = await request(server)
        .post('/api/v1/auth/login')
        .send({
          email: testSellerData.email,
          password: testSellerData.password
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.headers['set-cookie']).toBeDefined();

      // Save token for later tests
      authToken = response.body.data.accessToken;
    });

    it('should reject login with invalid email', async () => {
      const response = await request(server)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: testSellerData.password
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should reject login with wrong password', async () => {
      const response = await request(server)
        .post('/api/v1/auth/login')
        .send({
          email: testSellerData.email,
          password: 'WrongPassword123!@#'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  // ==================== JWT MIDDLEWARE TESTS ====================

  describe('JWT Middleware', () => {
    it('should reject request with missing token', async () => {
      const response = await request(server)
        .get('/api/v1/users/profile');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should reject request with invalid token', async () => {
      const response = await request(server)
        .get('/api/v1/users/profile')
        .set('Authorization', 'Bearer invalid_token_here');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should reject request with malformed token', async () => {
      const response = await request(server)
        .get('/api/v1/users/profile')
        .set('Authorization', 'InvalidFormatToken');

      expect(response.status).toBe(401);
    });

    it('should accept request with valid token', async () => {
      const response = await request(server)
        .get('/api/v1/users/profile')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should accept token from cookies', async () => {
      const response = await request(server)
        .get('/api/v1/users/profile')
        .set('Cookie', [`accessToken=${authToken}`]);

      expect(response.status).toBe(200);
    });
  });

  // ==================== AUCTION & BIDDING TESTS ====================

  describe('Create Auction', () => {
    it('should create a valid auction', async () => {
      const futureStart = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour from now
      const futureEnd = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now

      const auctionData = {
        title: 'Test Laptop',
        description: 'A high-performance laptop in excellent condition',
        startingPrice: 500,
        minBidIncrement: 10,
        category: 'electronics',
        condition: 'new',
        startTime: futureStart.toISOString(),
        endTime: futureEnd.toISOString(),
        images: [],
        reservePrice: 450
      };

      const response = await request(server)
        .post('/api/v1/auctions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(auctionData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.auction).toHaveProperty('_id');
      expect(response.body.data.auction.status).toBe('scheduled');
      expect(response.body.data.auction.title).toBe(auctionData.title);

      testAuction = response.body.data.auction;
    });

    it('should reject auction with invalid time range', async () => {
      const pastStart = new Date(Date.now() - 1 * 60 * 60 * 1000);
      const pastEnd = new Date(Date.now() + 2 * 60 * 60 * 1000);

      const response = await request(server)
        .post('/api/v1/auctions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Invalid Auction',
          description: 'Test description with at least 20 characters here',
          startingPrice: 100,
          minBidIncrement: 5,
          category: 'electronics',
          condition: 'good',
          startTime: pastStart.toISOString(),
          endTime: pastEnd.toISOString()
        });

      expect(response.status).toBe(400);
    });
  });

  describe('Place Bid - Valid Bids', () => {
    let activeBuyerToken;
    let activeBuyerAuction;
    let bidder2Token;

    beforeAll(async () => {
      // Get buyer token
      const loginRes = await request(server)
        .post('/api/v1/auth/login')
        .send({
          email: testBuyerData.email,
          password: testBuyerData.password
        });
      activeBuyerToken = loginRes.body.data.accessToken;

      // Register and login a second bidder (not the auction seller)
      await request(server)
        .post('/api/v1/auth/register')
        .send({
          username: 'bidder2',
          email: 'bidder2@example.com',
          password: 'Bidder2123!@#',
          displayName: 'Second Bidder'
        });
      const bidder2Res = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'bidder2@example.com', password: 'Bidder2123!@#' });
      bidder2Token = bidder2Res.body.data.accessToken;

      // Create an active auction (manually set status)
      const now = new Date();
      const futureEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000);

      const auctionRes = await request(server)
        .post('/api/v1/auctions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Active Laptop',
          description: 'A laptop ready for bidding with minimum 20 chars',
          startingPrice: 100,
          minBidIncrement: 10,
          category: 'electronics',
          condition: 'good',
          startTime: new Date(now.getTime() + 60 * 1000).toISOString(),
          endTime: futureEnd.toISOString(),
          images: []
        });

      activeBuyerAuction = auctionRes.body.data.auction;

      // Backdate startTime and set active so bids are accepted
      await Auction.findByIdAndUpdate(activeBuyerAuction._id, {
        status: 'active',
        startTime: new Date(now.getTime() - 10 * 60 * 1000)
      });
    });

    it('should place a valid bid with amount >= minimum', async () => {
      const response = await request(server)
        .post(`/api/v1/bids/auction/${activeBuyerAuction._id}`)
        .set('Authorization', `Bearer ${activeBuyerToken}`)
        .send({ amount: 150 });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.bid).toHaveProperty('_id');
      expect(response.body.data.bid.amount).toBe(150);
      expect(response.body.data.currentPrice).toBe(150);
      expect(response.body.data.minNextBid).toBe(160); // 150 + 10 increment
    });

    it('should place second bid higher than first', async () => {
      const response = await request(server)
        .post(`/api/v1/bids/auction/${activeBuyerAuction._id}`)
        .set('Authorization', `Bearer ${bidder2Token}`)
        .send({ amount: 175 });

      expect(response.status).toBe(201);
      expect(response.body.data.bid.amount).toBe(175);
      expect(response.body.data.minNextBid).toBe(185); // 175 + 10 increment
    });

    it('should track bid count correctly', async () => {
      const auctionRes = await request(server)
        .get(`/api/v1/auctions/${activeBuyerAuction._id}`)
        .set('Authorization', `Bearer ${activeBuyerToken}`);

      expect(auctionRes.body.data.auction.bidCount).toBe(2);
    });
  });

  describe('Place Bid - Invalid Bids', () => {
    let buyerToken;
    let buyerAuction;
    let secondBidderToken;

    beforeAll(async () => {
      const loginRes = await request(server)
        .post('/api/v1/auth/login')
        .send({
          email: testBuyerData.email,
          password: testBuyerData.password
        });
      buyerToken = loginRes.body.data.accessToken;

      // Register a second bidder (not the auction seller) for increment test
      await request(server)
        .post('/api/v1/auth/register')
        .send({
          username: 'secondbidder',
          email: 'secondbidder@example.com',
          password: 'SecondBidder123!@#',
          displayName: 'Second Bidder'
        });
      const secondBidderRes = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'secondbidder@example.com', password: 'SecondBidder123!@#' });
      secondBidderToken = secondBidderRes.body.data.accessToken;

      // Create and activate auction
      const now = new Date();
      const futureEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000);

      const auctionRes = await request(server)
        .post('/api/v1/auctions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Invalid Bid Test Laptop',
          description: 'A laptop for testing invalid bids minimum 20 chars',
          startingPrice: 200,
          minBidIncrement: 20,
          category: 'electronics',
          condition: 'good',
          startTime: new Date(now.getTime() + 60 * 1000).toISOString(),
          endTime: futureEnd.toISOString(),
          images: []
        });

      buyerAuction = auctionRes.body.data.auction;
      await Auction.findByIdAndUpdate(buyerAuction._id, {
        status: 'active',
        startTime: new Date(now.getTime() - 10 * 60 * 1000)
      });
    });

    it('should reject bid amount below starting price', async () => {
      const response = await request(server)
        .post(`/api/v1/bids/auction/${buyerAuction._id}`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ amount: 150 });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Minimum bid');
    });

    it('should reject bid amount below minimum increment', async () => {
      // First place a valid bid
      await request(server)
        .post(`/api/v1/bids/auction/${buyerAuction._id}`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ amount: 250 });

      // Try to place bid below minimum increment (need 270, send 260)
      const response = await request(server)
        .post(`/api/v1/bids/auction/${buyerAuction._id}`)
        .set('Authorization', `Bearer ${secondBidderToken}`)
        .send({ amount: 260 }); // 250 + 20 = 270 required

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Minimum bid');
    });

    it('should reject seller bidding on own auction', async () => {
      const response = await request(server)
        .post(`/api/v1/bids/auction/${buyerAuction._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount: 500 });

      // Seller already has a winning bid, so should get consecutive bid error
      expect(response.status).toBe(400);
    });

    it('should reject bid on inactive auction', async () => {
      const response = await request(server)
        .post(`/api/v1/bids/auction/${testAuction._id}`) // scheduled auction
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ amount: 600 });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('not active');
    });

    it('should reject consecutive bids from same user', async () => {
      // User already has winning bid, try to bid again
      const response = await request(server)
        .post(`/api/v1/bids/auction/${buyerAuction._id}`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ amount: 300 });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('consecutive bids');
    });
  });

  // ==================== CONCURRENT BID RACE CONDITION TESTS ====================

  describe('Concurrent Bid Race Condition', () => {
    let raceBuyerToken;
    let raceAuction;

    beforeAll(async () => {
      const loginRes = await request(server)
        .post('/api/v1/auth/login')
        .send({
          email: testBuyerData.email,
          password: testBuyerData.password
        });
      raceBuyerToken = loginRes.body.data.accessToken;

      // Create and activate auction
      const now = new Date();
      const futureEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000);

      const auctionRes = await request(server)
        .post('/api/v1/auctions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Race Condition Test Laptop',
          description: 'Testing concurrent bids minimum 20 characters here',
          startingPrice: 300,
          minBidIncrement: 25,
          category: 'electronics',
          condition: 'good',
          startTime: new Date(now.getTime() + 60 * 1000).toISOString(),
          endTime: futureEnd.toISOString(),
          images: []
        });

      raceAuction = auctionRes.body.data.auction;
      await Auction.findByIdAndUpdate(raceAuction._id, {
        status: 'active',
        startTime: new Date(now.getTime() - 10 * 60 * 1000)
      });
    });

    it('should handle concurrent bids with Redis lock', async () => {
      // Create a third test user for concurrent bidding
      const concurrentUserRes = await request(server)
        .post('/api/v1/auth/register')
        .send({
          username: 'concurrent_user',
          email: 'concurrent@example.com',
          password: 'Concurrent123!@#',
          displayName: 'Concurrent Bidder'
        });

      const loginRes = await request(server)
        .post('/api/v1/auth/login')
        .send({
          email: 'concurrent@example.com',
          password: 'Concurrent123!@#'
        });

      const concurrentToken = loginRes.body.data.accessToken;

      // Place initial bid
      const initialBid = await request(server)
        .post(`/api/v1/bids/auction/${raceAuction._id}`)
        .set('Authorization', `Bearer ${raceBuyerToken}`)
        .send({ amount: 400 });

      expect(initialBid.status).toBe(201);

      // Simulate concurrent bids - send multiple requests simultaneously
      const concurrentRequests = [
        request(server)
          .post(`/api/v1/bids/auction/${raceAuction._id}`)
          .set('Authorization', `Bearer ${concurrentToken}`)
          .send({ amount: 425 }),
        request(server)
          .post(`/api/v1/bids/auction/${raceAuction._id}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ amount: 450 })
      ];

      const results = await Promise.allSettled(concurrentRequests);

      // Count successful bids
      const successfulBids = results.filter(
        (r) => r.status === 'fulfilled' && r.value.status === 201
      ).length;

      // Count failed bids (lock contention)
      const failedBids = results.filter(
        (r) => r.status === 'fulfilled' && r.value.status === 409
      ).length;

      // At least one should succeed, others might fail due to lock
      expect(successfulBids + failedBids).toBeGreaterThan(0);

      // Verify auction state is consistent
      const auctionCheckRes = await request(server)
        .get(`/api/v1/auctions/${raceAuction._id}`)
        .set('Authorization', `Bearer ${raceBuyerToken}`);

      const finalAuction = auctionCheckRes.body.data.auction;
      const bidCountRes = await request(server)
        .get(`/api/v1/bids/auction/${raceAuction._id}`)
        .set('Authorization', `Bearer ${raceBuyerToken}`);

      const actualBidCount = bidCountRes.body.data.bids.length;

      // Bid count should match what's in the database
      expect(finalAuction.bidCount).toBe(actualBidCount);
    });

    it('should prevent race condition data corruption', async () => {
      // Get final auction state
      const auctionRes = await request(server)
        .get(`/api/v1/auctions/${raceAuction._id}`)
        .set('Authorization', `Bearer ${raceBuyerToken}`);

      const auction = auctionRes.body.data.auction;

      // Get all bids
      const bidsRes = await request(server)
        .get(`/api/v1/bids/auction/${raceAuction._id}`)
        .set('Authorization', `Bearer ${raceBuyerToken}`);

      const bids = bidsRes.body.data.bids;

      // Verify current price matches highest bid
      const highestBid = bids.reduce((max, bid) =>
        bid.amount > max.amount ? bid : max
      , bids[0]);

      expect(auction.currentPrice).toBe(highestBid.amount);

      // Verify only one bid has isWinning = true
      const winningBids = bids.filter(bid => bid.isWinning);
      expect(winningBids.length).toBe(1);
      expect(winningBids[0].amount).toBe(highestBid.amount);
    });
  });
});
