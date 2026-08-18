// routes/chatRoutes.js
import express from "express";
import { protectedDashboard } from "../middleware/authMiddleware.js";
import {
  createOrGetThread,
  getUserThreads,
  getThreadById,
  sendMessage,
  deleteThread,
  clearThread
} from "../controllers/chatController.js";
import restrictFreeTrial from "../middleware/trialRestriction.js";

const router = express.Router();

// All routes require authentication
router.use(protectedDashboard());

// Thread management
router.post("/threads",restrictFreeTrial, createOrGetThread);              // Create or get thread
router.get("/threads", getUserThreads);                  // Get all user threads
router.get("/threads/:threadId", getThreadById);         // Get specific thread
router.delete("/threads/:threadId",restrictFreeTrial, deleteThread);       // Delete thread
router.post("/threads/:threadId/clear",restrictFreeTrial, clearThread);    // Clear messages

// Messaging
router.post("/threads/:threadId/messages", restrictFreeTrial, sendMessage); // Send message and get response

export default router;

