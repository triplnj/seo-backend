import mongoose from 'mongoose';

const trialUsageSchema = new mongoose.Schema(
  {
    deviceHash: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    count: {
      type: Number,
      default: 0,
      min: 0
    },
    lastUsedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

const TrialUsage = mongoose.model(
  'TrialUsage',
  trialUsageSchema
);

export default TrialUsage;
