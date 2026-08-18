import mongoose from "mongoose";
import Session from "../models/session.js";

export const listSessions = async (req, res) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const sessions = await Session.find({
    userId: req.user.id,
    lastUsedAt: { $gte: thirtyDaysAgo }
  })
    .sort({ createdAt: -1 })
    .select("_id userAgent ip location createdAt lastUsedAt revokedAt")
    .lean();

  res.json({ success: true, sessions });
};

export const revokeSession = async (req, res) => {
  try {
    const { id } = req.params;

    // ensure user can only revoke their own session

    const session = await Session.findOne({ _id: id, userId: req.user.id });
    if (!session) return res.status(404).json({ message: 'Session not found' });
    if (session.revokedAt) return res.status(200).json({ message: 'Session already revoked' });

    session.revokedAt = new Date();
    await session.save();

    return res.json({ success: true, message: 'Session revoked' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};