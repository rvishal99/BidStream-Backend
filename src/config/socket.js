import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

let io;

export const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Authentication middleware
  io.use((socket, next) => {
    // Try explicit auth token first, then fall back to httpOnly cookie
    let token = socket.handshake.auth.token;

    if (!token && socket.handshake.headers.cookie) {
      for (const part of socket.handshake.headers.cookie.split(';')) {
        const [name, ...rest] = part.trim().split('=');
        if (name === 'accessToken') {
          token = decodeURIComponent(rest.join('='));
          break;
        }
      }
    }

    if (!token) {
      // Allow unauthenticated connections for public viewing
      return next();
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
    } catch (error) {
      // Invalid token - allow connection but mark as unauthenticated
      console.warn('Invalid socket token:', error.message);
    }

    next();
  });

  // Connection handling
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Join auction room
    socket.on('joinAuction', (auctionId) => {
      const room = `auction:${auctionId}`;
      socket.join(room);
      console.log(`Socket ${socket.id} joined room ${room}`);

      // Notify others in the room
      socket.to(room).emit('userJoined', {
        auctionId,
        timestamp: new Date()
      });
    });

    // Leave auction room
    socket.on('leaveAuction', (auctionId) => {
      const room = `auction:${auctionId}`;
      socket.leave(room);
      console.log(`Socket ${socket.id} left room ${room}`);
    });

    // Join watchlist room (for user-specific notifications)
    if (socket.user) {
      const userRoom = `user:${socket.user.userId}`;
      socket.join(userRoom);
    }

    // Place bid via socket
    socket.on('placeBid', async (data, callback) => {
      try {
        const { auctionId, amount } = data;

        // Will be handled by bidController with Redis lock
        const bidController = await import('../controllers/bidController.js');
        const result = await bidController.placeBidSocket(socket, auctionId, amount);

        // Broadcast to auction room - emit both events for compatibility
        io.to(`auction:${auctionId}`).emit(`auction:${auctionId}:bid`, result);
        io.to(`auction:${auctionId}`).emit('bidUpdated', {
          currentPrice: result.currentPrice,
          bidCount: result.bidCount,
          minNextBid: result.minNextBid
        });

        callback({ success: true, data: result });
      } catch (error) {
        callback({ success: false, message: error.message });
      }
    });

    // Disconnect handling
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  console.log('Socket.io initialized');
  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

export const emitToAuction = (auctionId, event, data) => {
  if (io) {
    io.to(`auction:${auctionId}`).emit(event, data);
  }
};

export const emitToUser = (userId, event, data) => {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
};

export const broadcastAuctionUpdate = (auctionId, update) => {
  if (io) {
    io.to(`auction:${auctionId}`).emit('auctionUpdated', update);
  }
};

export const notifyWinner = (auctionId, winnerId, data) => {
  if (io) {
    // Notify the winner specifically
    io.to(`user:${winnerId}`).emit('auctionWon', data);

    // Also broadcast to auction room
    io.to(`auction:${auctionId}`).emit('auctionEnded', data);
  }
};

export const notifyOutbid = (userId, data) => {
  if (io) {
    io.to(`user:${userId}`).emit('outbid', data);
  }
};