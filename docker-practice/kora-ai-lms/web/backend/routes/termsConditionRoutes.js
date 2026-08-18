import express from "express";
import { acceptTermsCondition, getTermsCondition, updateTermsCondition } from "../controllers/termsConditionController.js";
import { protectedDashboard } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protectedDashboard("student"), getTermsCondition);
router.post("/accept", protectedDashboard("student"), acceptTermsCondition);
router.post("/update", protectedDashboard("admin"), updateTermsCondition);

export default router;