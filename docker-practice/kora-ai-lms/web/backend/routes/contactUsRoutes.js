import express from "express";
import contactUsSchema from "../validations/contactUs.validation.js";
import { validateBody } from "../middleware/validate.js";
import { createContactUs } from "../controllers/contactUsController.js";
const router = express.Router();


router.post("/", validateBody(contactUsSchema), createContactUs);

export default router;
