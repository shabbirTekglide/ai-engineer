import express from "express";
import { getGlobalSettings, updateGlobalSettings, addModel } from "../controllers/configController.js";
import { protectedDashboard } from "../middleware/authMiddleware.js";
import { validateBody, addModelBody, updateGlobalBody } from "../validations/config.validation.js";

const router = express.Router();
// Global integrations / admin settings
router.get('/', protectedDashboard('admin'), getGlobalSettings);
router.post('/', protectedDashboard('admin'), validateBody(updateGlobalBody), updateGlobalSettings);
router.post('/models', protectedDashboard('admin'), validateBody(addModelBody), addModel);

export default router;
