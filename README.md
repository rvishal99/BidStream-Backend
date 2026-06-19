# BidStream — An auction platform

A production-ready RESTful backend for a real-time auction platform built with Node.js, Express, MongoDB, Redis, and Socket.io. Supports full auction lifecycle management, concurrent bid handling with distributed locking, async job queues, image uploads, and live event broadcasting.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Data Models](#data-models)
- [Real-Time Events (Socket.io)](#real-time-events-socketio)
- [Job Queue System](#job-queue-system)
- [Security](#security)
- [Scripts](#scripts)

---

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- Redis (local or managed)

### Installation

```bash
git clone <repo-url>
cd auction-backend
npm install
cp .env.example .env   # fill in required values (see below)
```

### Run

```bash
# Development (auto-restarts via nodemon)
npm run dev

# Production
npm start

# Seed database with sample data
npm run seed
```

### Health Checks

```
GET /health          → { status: "ok", timestamp }
GET /socket-health   → { socket: "connected", clients: N }
```

---


## Features

- **Real-Time Bidding** — bids accepted over both REST and Socket.io with identical validation logic
- **Distributed Locking** — Redis-based optimistic locking prevents race conditions on concurrent bids
- **Async Job Queue** — Bull + Redis schedules auction close jobs; retries on failure with exponential backoff
- **Auction Lifecycle** — state-machine-enforced transitions: `draft → scheduled → active → ended/sold/cancelled`
- **Image Uploads** — Multer handles multipart uploads; Cloudinary stores and serves images
- **Notification System** — per-user, per-event notifications (outbid, won, auction ended)
- **Watchlist** — users can watch/unwatch active auctions
- **Reserve Price** — optional reserve; auction closes as `ended` if reserve not met
- **Rate Limiting** — tiered limits: strict on auth endpoints, looser on general API
- **Pagination & Filtering** — full-text search, category/status/seller filters, sort on all list endpoints

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (ESM) |
| Framework | Express 5 |
| Database | MongoDB via Mongoose 8 |
| Cache / Queue | Redis via ioredis + Bull |
| Real-Time | Socket.io 4 |
| Authentication | JWT (jsonwebtoken) + bcryptjs |
| Validation | Zod |
| Image Storage | Cloudinary + Multer |
| Security | Helmet, CORS, express-rate-limit |
| Logging | Morgan |
| Testing | Jest + Supertest |
| Linting | ESLint 9 |

---

## Architecture Overview

```
Client (REST / WebSocket)
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  Express App  (src/index.js)                                │
│                                                             │
│  Middleware stack:                                          │
│  JSON → Cookie → Helmet → CORS → Morgan → Rate Limiter     │
│                                                             │
│  Routes  /api/v1/                                           │
│  ├── /auth      authController                              │
│  ├── /users     userController                              │
│  ├── /auctions  auctionController                           │
│  └── /bids      bidController                               │
└─────────────────────────────────────────────────────────────┘
        │                      │
        ▼                      ▼
┌──────────────┐      ┌──────────────────┐
│   MongoDB    │      │  Redis           │
│  (Mongoose)  │      │  ├── Bid cache   │
│  ├── User    │      │  ├── Rate limit  │
│  ├── Auction │      │  └── Bull queues │
│  ├── Bid     │      └──────────────────┘
│  ├── Order   │               │
│  └── Notif.  │               ▼
└──────────────┘       ┌──────────────────┐
                       │  Bull Job Queue  │
                       │  closeAuction    │
                       │  notifyWinner    │
                       │  sendEmail       │
                       └──────────────────┘
```

### Auction State Machine

```
draft ──────────────────────────────────────► cancelled
  │                                               ▲
  ▼                                               │
scheduled  ──────────────────────────────────────►┤
  │                                               │
  ▼                                               │
active  ─────────────────────────────────────────►┤
  │
  ├──► ended ──► sold
  │
  └──► sold
```

Valid transitions are enforced in `src/utils/auctionStateMachine.js`. Any attempt to jump to a disallowed state throws a `400 AppError` before the database is touched.

---

## Project Structure

```
src/
├── config/
│   ├── database.js         MongoDB connection
│   ├── redis.js            ioredis client
│   ├── socket.js           Socket.io server + event handlers
│   ├── queue.js            Bull queues: closeAuction, notifyWinner, sendEmail
│   └── cloudinary.js       Cloudinary SDK init
├── controllers/
│   ├── authController.js   register, login, logout, refresh, change-password
│   ├── auctionController.js full CRUD + publish, end, watch/unwatch
│   ├── bidController.js    REST + Socket bid placement (shared core logic)
│   └── userController.js   profile, listings, bid history
├── middleware/
│   ├── auth.js             JWT protect + optionalAuth
│   ├── errorHandler.js     AppError class + global error handler
│   ├── rateLimiter.js      tiered rate limits (Redis-backed when available)
│   ├── security.js         Helmet + CORS config
│   ├── validateMiddleware.js Zod body/query validator
│   └── logger.js           Morgan HTTP logger
├── models/
│   ├── Auction.js          schema + isActive virtual + compound indexes
│   ├── Bid.js              schema + getHighestBid / getBidCount statics
│   ├── User.js             schema + bcrypt hooks + toJSON password strip
│   ├── Order.js            schema + shipping/payment fields
│   └── Notification.js     schema + getUnreadCount static
├── routes/
│   ├── index.js            route aggregator under /api/v1
│   ├── authRoutes.js
│   ├── auctionRoutes.js
│   ├── bidRoutes.js
│   └── userRoutes.js
├── upload/
│   └── uploadMiddleware.js Multer config (5MB limit, UUID filenames)
├── utils/
│   ├── auctionStateMachine.js transition table + validators
│   └── redisHelpers.js     bid cache, distributed lock helpers
├── validators/
│   ├── authValidator.js    register, login, changePassword, updateUser schemas
│   └── auctionValidator.js create, update, query, placeBid schemas
├── scripts/
│   └── seedDatabase.js     development seed script
├── tests/
│   └── auction.test.js
└── index.js                app entry point + graceful shutdown
```

---


## Environment Variables

```env
# Server
PORT=3000
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017/auction_db

# Redis
REDIS_URL=redis://localhost:6379

# JWT (minimum 32 characters each)
JWT_SECRET=your_jwt_secret_minimum_32_chars
JWT_REFRESH_SECRET=your_refresh_secret_minimum_32_chars
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# CORS
CLIENT_URL=http://localhost:5173

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Rate Limiting (optional overrides)
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=500
```

> The app will **crash at startup** if `JWT_SECRET` or `JWT_REFRESH_SECRET` are shorter than 32 characters.

---

## API Reference

All endpoints are prefixed with `/api/v1`.

### Authentication — `/auth`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | — | Register a new user |
| POST | `/auth/login` | — | Login, returns tokens via httpOnly cookie |
| POST | `/auth/logout` | — | Clear auth cookies |
| POST | `/auth/refresh-token` | — | Rotate access token using refresh token |
| GET | `/auth/me` | Required | Get current user profile |
| POST | `/auth/change-password` | Required | Change password |

Auth endpoints are limited to **10 requests per 15 minutes** per IP.

#### Register

```json
POST /api/v1/auth/register
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "securepassword123",
  "displayName": "John Doe"
}
```

#### Login

```json
POST /api/v1/auth/login
{
  "email": "john@example.com",
  "password": "securepassword123"
}
```

---

### Auctions — `/auctions`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/auctions` | Optional | List auctions with filters and pagination |
| GET | `/auctions/my-auctions` | Required | List caller's own auctions |
| GET | `/auctions/watched` | Required | List caller's watchlist |
| GET | `/auctions/:id` | Optional | Get single auction with bid history |
| POST | `/auctions` | Required | Create auction (with image upload) |
| PATCH | `/auctions/:id` | Required | Update auction (draft/scheduled only) |
| DELETE | `/auctions/:id` | Required | Delete auction (not active/ended) |
| POST | `/auctions/:id/publish` | Required | Publish auction (moves to scheduled or active) |
| POST | `/auctions/:id/end` | Required | Manually end active auction |
| POST | `/auctions/:id/watch` | Required | Add to watchlist |
| DELETE | `/auctions/:id/watch` | Required | Remove from watchlist |

#### Query Parameters for `GET /auctions`

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 10) |
| `category` | string | Filter by category |
| `status` | string | Filter by status (`active`, `scheduled`, `ended`, `sold`) |
| `seller` | ObjectId | Filter by seller ID |
| `search` | string | Full-text search on title and description |
| `sortBy` | string | Sort field (default: `createdAt`) |
| `sortOrder` | `asc` \| `desc` | Sort direction (default: `desc`) |

#### Create Auction

```
POST /api/v1/auctions
Content-Type: multipart/form-data
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `title` | string | Yes | Max 200 chars |
| `description` | string | Yes | Max 5000 chars |
| `startingPrice` | number | Yes | Min 0 |
| `minBidIncrement` | number | No | Default 1 |
| `category` | string | Yes | See values below |
| `condition` | string | No | Default `good` |
| `startTime` | ISO date | Yes | Must be in the future |
| `endTime` | ISO date | Yes | Must be after `startTime`; min 1h, max 30d |
| `reservePrice` | number | No | Auction ends without winner if not met |
| `images` | file[] | No | Up to 10 images, max 5MB each |

**Category values:** `electronics` `fashion` `art` `collectibles` `vehicles` `home` `sports` `other`

**Condition values:** `new` `like_new` `good` `fair` `poor`

---

### Bids — `/bids`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/bids/auction/:id` | Required | Place a bid on an auction |
| GET | `/bids/auction/:id` | — | Get all bids for an auction (paginated) |
| GET | `/bids/auction/:id/highest` | — | Get current price + minimum next bid |
| GET | `/bids/my-bids` | Required | Get caller's bid history |

#### Place Bid

```json
POST /api/v1/bids/auction/:id
{
  "amount": 75.00
}
```

**Bid rules enforced server-side:**
- Amount must be ≥ `currentPrice + minBidIncrement`
- Sellers cannot bid on their own auctions
- Users cannot place consecutive bids (must wait for another bidder)
- Auction must be in `active` status within its `startTime`–`endTime` window
- Redis distributed lock prevents race conditions on concurrent bids

---

### Users — `/users`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/users/profile` | Required | Get own profile |
| PATCH | `/users/profile` | Required | Update own profile |
| GET | `/users/:userId` | — | Get public user profile |
| GET | `/users/:userId/listings` | — | Get user's auction listings |
| GET | `/users/:userId/bids` | — | Get user's public bid history |

---

## Data Models

### User

| Field | Type | Notes |
|-------|------|-------|
| `username` | String | Unique, 3–30 chars, indexed |
| `email` | String | Unique, lowercase, indexed |
| `password` | String | bcrypt hashed (factor 12); stripped from all JSON output |
| `displayName` | String | Public display name, max 50 chars |
| `avatar` | String | URL |
| `bio` | String | Up to 500 chars |
| `role` | `user` \| `admin` | Default: `user` |
| `isVerified` | Boolean | Email verification flag |
| `refreshToken` | String | Stored server-side for rotation; stripped from JSON output |
| `listings` | ObjectId[] | Ref: Auction |
| `bids` | ObjectId[] | Ref: Bid |
| `orders` | ObjectId[] | Ref: Order |

### Auction

| Field | Type | Notes |
|-------|------|-------|
| `title` | String | Max 200 chars |
| `description` | String | Max 5000 chars |
| `startingPrice` | Number | Min 0 |
| `currentPrice` | Number | Updated on each bid; defaults to `startingPrice` |
| `minBidIncrement` | Number | Default 1, min 0.01 |
| `reservePrice` | Number | Optional; `null` means no reserve |
| `images` | String[] | Cloudinary secure URLs |
| `category` | String | Enum (8 values) |
| `condition` | String | Enum (5 values); default `good` |
| `seller` | ObjectId | Ref: User |
| `winner` | ObjectId | Ref: User; set when auction closes as `sold` |
| `startTime` / `endTime` | Date | Indexed |
| `status` | String | Enum: `draft` `scheduled` `active` `ended` `cancelled` `sold` |
| `bidCount` | Number | Denormalized; incremented on each bid |
| `watchers` | ObjectId[] | Ref: User |
| `featured` | Boolean | Default false |
| **`isActive`** | virtual | `true` when `status === active` and within time window |

**Compound indexes:** `(seller, status)` · `(startTime, endTime)` · `(currentPrice desc)` · `(category)` · `(status)`

### Bid

| Field | Type | Notes |
|-------|------|-------|
| `auction` | ObjectId | Ref: Auction, indexed |
| `bidder` | ObjectId | Ref: User, indexed |
| `amount` | Number | Min 0 |
| `isWinning` | Boolean | Only one bid per auction holds `true` at any time |
| `isAutoBid` | Boolean | Reserved for future auto-bid feature |

**Static methods:** `getHighestBid(auctionId)` · `getBidCount(auctionId)`

**Compound indexes:** `(auction, amount desc)` · `(bidder, createdAt desc)` · `(auction, isWinning)`

### Order

| Field | Type | Notes |
|-------|------|-------|
| `buyer` / `seller` | ObjectId | Ref: User |
| `auction` | ObjectId | Ref: Auction |
| `bid` | ObjectId | Ref: Bid (the winning bid) |
| `amount` | Number | Final sale price |
| `status` | String | `pending` → `paid` → `shipped` → `delivered` (also `cancelled`, `refunded`) |
| `shippingAddress` | Object | `street`, `city`, `state`, `postalCode`, `country` |
| `paymentId` | String | External payment reference (Stripe, etc.) |
| `trackingNumber` | String | Shipping carrier tracking reference |
| `notes` | String | Max 1000 chars |

### Notification

| Field | Type | Notes |
|-------|------|-------|
| `user` | ObjectId | Ref: User |
| `type` | String | `bid` `outbid` `auction_won` `auction_ended` `payment` `shipping` `system` |
| `title` | String | Max 100 chars |
| `message` | String | Max 500 chars |
| `isRead` | Boolean | Default `false` |
| `relatedAuction` | ObjectId | Optional context link |
| `relatedOrder` | ObjectId | Optional context link |
| `data` | Mixed | Arbitrary payload (e.g. `{ finalPrice, winnerId }`) |

**Static method:** `getUnreadCount(userId)`

**Compound index:** `(user, isRead, createdAt desc)`

---

## Real-Time Events (Socket.io)

The Socket.io server authenticates connections via JWT from `socket.handshake.auth.token` or the `accessToken` httpOnly cookie. Unauthenticated connections are allowed for read-only observation.

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `joinAuction` | `auctionId: string` | Subscribe to live updates for an auction |
| `leaveAuction` | `auctionId: string` | Unsubscribe from an auction room |
| `placeBid` | `{ auctionId, amount }` | Place a bid (requires authenticated connection) |

### Server → Client

| Event | Room | Payload | Description |
|-------|------|---------|-------------|
| `auctionUpdated` | `auction:{id}` | `{ status, ... }` | Auction state or price changed |
| `bidUpdated` | `auction:{id}` | `{ currentPrice, bidCount, minNextBid }` | Lightweight price update after bid |
| `auction:{id}:bid` | `auction:{id}` | Full bid object | Complete bid details after placement |
| `auctionEnded` | `auction:{id}` | `{ status, highestBid }` | Auction closed (no winner) |
| `auctionWon` | `user:{id}` | `{ auctionId, title, amount, orderId }` | Private winner notification |
| `outbid` | `user:{id}` | `{ auctionId, auctionTitle, newAmount }` | Private outbid notification |
| `userJoined` | `auction:{id}` | `{ auctionId, timestamp }` | Viewer joined the auction room |

### Room Naming Convention

| Room | Subscribers |
|------|-------------|
| `auction:{auctionId}` | All clients watching a specific auction |
| `user:{userId}` | A single authenticated user (joined automatically on connect) |

---

## Job Queue System

Three Bull queues backed by Redis handle all async operations:

### `close-auction`

Scheduled at auction creation with a delay equal to `endTime − now`. Job ID is `close-auction-{auctionId}` enabling idempotent cancellation.

**Process:**
1. Fetch the auction; skip if already `ended`, `sold`, or `cancelled`
2. Find the highest bid
3. Check if reserve price is met
4. **If met** → set status to `sold`, assign `winner`, create `Order`, create winner and seller `Notification` documents, queue a `notify-winner` job, broadcast via Socket.io
5. **If not met** → set status to `ended`, notify seller, broadcast via Socket.io

**Retry policy:** 3 attempts · exponential backoff starting at 2 seconds

**Queue fallback:** If Redis/Bull is unavailable, `getAuctionById` runs `closeAuction()` inline the first time an expired auction is fetched, ensuring settlement is never blocked on the queue.

### `notify-winner`

Queued automatically by the close job after a sale. Placeholder for transactional email integration.

**Retry policy:** 2 attempts

### `send-email`

General-purpose email queue. Placeholder for email service (SendGrid, SES, etc.).

### Helper API

```javascript
import { scheduleAuctionClose, cancelScheduledAuction } from './config/queue.js';

// Called automatically when an auction is created or published
scheduleAuctionClose(auctionId, endTime);

// Called when an auction is cancelled
cancelScheduledAuction(auctionId);
```

---

## Security

| Mechanism | Details |
|-----------|---------|
| Security headers | Helmet with strict CSP: `defaultSrc 'self'`, `frameSrc 'none'`, `objectSrc 'none'` |
| CORS | Explicit origin whitelist; `credentials: true`; configurable via `CLIENT_URL` |
| Auth tokens | Short-lived access token (15m) + long-lived refresh token (7d) in httpOnly cookies |
| Password storage | bcrypt with cost factor 12 |
| Input validation | Zod schemas on all mutating endpoints; invalid input returns 400 before any DB call |
| Rate limiting | Auth: 10 req/15min · General API: 500 req/15min · Redis-backed when available |
| Distributed bid lock | Redis `SET NX PX` with random token; `releaseLock` validates token before delete |
| Request size limit | JSON body capped at 10 kb |
| File uploads | MIME type whitelist (JPEG, PNG, GIF, WebP) · 5 MB per file · max 10 files |
| Startup validation | Server refuses to start if JWT secrets are shorter than 32 characters |
| Graceful shutdown | `SIGTERM` / `SIGINT` handlers drain the HTTP server before `process.exit` |

---

## Scripts

```bash
# Start server in production mode
npm start

# Start server with hot reload (nodemon)
npm run dev

# Seed the database with sample auctions, users, and bids
npm run seed

# Run test suite
npm test

# Run tests with coverage report
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Lint source files
npx eslint src/

# Lint and auto-fix
npx eslint src/ --fix
```

---

## License

MIT
