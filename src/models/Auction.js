import mongoose from 'mongoose';

const auctionSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    maxlength: 5000
  },
  startingPrice: {
    type: Number,
    required: true,
    min: 0
  },
  currentPrice: {
    type: Number,
    default: function() {
      return this.startingPrice;
    }
  },
  minBidIncrement: {
    type: Number,
    default: 1,
    min: 0.01
  },
  images: [{
    type: String
  }],
  category: {
    type: String,
    required: true,
    enum: ['electronics', 'fashion', 'art', 'collectibles', 'vehicles', 'home', 'sports', 'other'],
    index: true
  },
  condition: {
    type: String,
    enum: ['new', 'like_new', 'good', 'fair', 'poor'],
    default: 'good'
  },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  winner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  startTime: {
    type: Date,
    required: true,
    index: true
  },
  endTime: {
    type: Date,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'active', 'ended', 'cancelled', 'sold'],
    default: 'draft',
    index: true
  },
  bidCount: {
    type: Number,
    default: 0
  },
  watchers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  featured: {
    type: Boolean,
    default: false
  },
  reservePrice: {
    type: Number,
    default: null,
    min: 0
  }
}, {
  timestamps: true
});

auctionSchema.index({ startTime: 1, endTime: 1 });
auctionSchema.index({ currentPrice: -1 });
auctionSchema.index({ seller: 1, status: 1 });

auctionSchema.virtual('isActive').get(function() {
  const now = new Date();
  return this.status === 'active' && now >= this.startTime && now <= this.endTime;
});

auctionSchema.set('toJSON', { virtuals: true });
auctionSchema.set('toObject', { virtuals: true });

const Auction = mongoose.model('Auction', auctionSchema);

export default Auction;