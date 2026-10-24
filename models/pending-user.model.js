import mongoose from 'mongoose';

const pendingUserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  expires_at: {
    type: Date,
    required: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'pending_users'
});

// MongoDB removes the document automatically once expires_at has passed
pendingUserSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('PendingUser', pendingUserSchema);
