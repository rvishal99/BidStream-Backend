import mongoose from 'mongoose';

const bidSchema = new mongoose.Schema({
  auction: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Auction',
    required: true,
    index: true
  },
  bidder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  isWinning: {
    type: Boolean,
    default: false,
    index: true
  },
  isAutoBid: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

bidSchema.index({ auction: 1, amount: -1 });
bidSchema.index({ bidder: 1, createdAt: -1 });
bidSchema.index({ auction: 1, isWinning: 1 });

bidSchema.statics.getHighestBid = async function(auctionId) {
  return this.findOne({ auction: auctionId }).sort({ amount: -1 });
};

bidSchema.statics.getBidCount = async function(auctionId) {
  return this.countDocuments({ auction: auctionId });
};

const Bid = mongoose.model('Bid', bidSchema);

export default Bid;