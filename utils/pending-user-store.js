import PendingUser from '../models/pending-user.model.js';

// Stores signups awaiting OTP verification in MongoDB (no Redis dependency)

export const savePendingUser = async (email, data, ttlSeconds = 600) => {
  const expires_at = new Date(Date.now() + ttlSeconds * 1000);
  await PendingUser.findOneAndUpdate(
    { email },
    { email, data, expires_at },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
};

export const getPendingUser = async (email) => {
  const doc = await PendingUser.findOne({ email, expires_at: { $gt: new Date() } }).lean();
  return doc ? doc.data : null;
};

export const deletePendingUser = async (email) => {
  await PendingUser.deleteOne({ email });
};
