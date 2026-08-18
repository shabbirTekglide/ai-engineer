import express from "express";
import { protectedDashboard } from "../middleware/authMiddleware.js";
import { createEventSchema, updateEventSchema } from "../validations/calendar.validation.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import { createCalendar, deleteCalendarEvent, getCalendarEvents, updateCalendarEvent } from "../controllers/calendarController.js";
import { objectIdParam } from "../validations/common.validation.js";

const router = express.Router();
router.get('/', protectedDashboard(), getCalendarEvents)
router.post('/',protectedDashboard(),validateBody(createEventSchema),createCalendar )
router.delete('/:eventId',protectedDashboard(),validateParams(objectIdParam('eventId')),deleteCalendarEvent)
router.put('/:eventId',protectedDashboard(),validateParams(objectIdParam('eventId')),validateBody(updateEventSchema), updateCalendarEvent) 


export default router;
