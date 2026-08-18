// routes/classRoutes.js
import express from "express";
import {getSettings, toggleNotificationEnable, toggleStudyReminder} from "../controllers/settingsController.js"
import { protectedDashboard } from "../middleware/authMiddleware.js";
const router = express.Router();

router.get("/", protectedDashboard(), getSettings);

// ✅ validate route params, NOT body
router.get("/toggleNotification", protectedDashboard(), toggleNotificationEnable);

// ✅ validate request body only for POST
router.get("/toggleStudyReminder", protectedDashboard(), toggleStudyReminder);

export default router;