import express from "express";
import { protectedDashboard } from "../middleware/authMiddleware.js";
import { getFlashCards, getStudyGuide, getPracticeQuiz } from "../controllers/learnController.js";

const router = express.Router();

// Quiz / flashcards / study guide only read stored lecture data (study guide may AI-generate if missing — gated in controller).
router.post("/quiz", protectedDashboard(), getPracticeQuiz);
router.post("/flashCards", protectedDashboard(), getFlashCards);
router.post("/studyGuide", protectedDashboard(), getStudyGuide);
export default router;
