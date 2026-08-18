import express from 'express';
import { protectedDashboard } from '../middleware/authMiddleware.js';
import { listSessions, revokeSession } from '../controllers/sessionController.js';

const router = express.Router();
router.get("/sessions", protectedDashboard(), listSessions);
router.post("/sessions/:id/revoke", protectedDashboard(), revokeSession);

export default router;