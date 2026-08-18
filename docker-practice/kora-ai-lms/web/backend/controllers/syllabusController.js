// controllers/syllabusController.js
import mongoose from "mongoose";
import Class from "../models/class.js";
import User from "../models/User.js";
import { parseSyllabus } from "../services/enhancedSyllabusParser.js";

/**
 * Upload and parse syllabus file
 * Note: Events are stored in User.calendar (distributed model), not in Class.parsedSyllabus
 */
export const uploadSyllabus = async (req, res) => {
  try {
    // ---------- 1) AUTHENTICATION ----------
    const ownerId = req.user?.id;
    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // ---------- 2) PARAMS & BODY VALIDATION ----------
    const { classId } = req.params;
    const { semesterStart } = req.body; // Optional semester start date
    
    if (!classId || !mongoose.isValidObjectId(classId)) {
      return res.status(400).json({ message: "Invalid or missing classId" });
    }

    if (!req.file?.buffer) {
      return res.status(400).json({ message: "Syllabus file is required" });
    }

    // ---------- 3) CLASS OWNERSHIP VERIFICATION ----------
    const cls = await Class.findOne({ _id: classId, ownerId });
    if (!cls) {
      return res.status(404).json({ message: "Class not found or unauthorized" });
    }

    // ---------- 4) PARSE SEMESTER START DATE ----------
    let semesterStartDate = null;
    if (semesterStart) {
      try {
        semesterStartDate = new Date(semesterStart);
        if (isNaN(semesterStartDate.getTime())) {
          return res.status(400).json({ message: "Invalid semester start date format. Use YYYY-MM-DD" });
        }
      } catch (error) {
        return res.status(400).json({ message: "Invalid semester start date format" });
      }
    }

    // ---------- 5) SYLLABUS PARSING ----------
    console.log(`Starting syllabus parsing for class: ${cls.name}`);
    
    const parserOptions = {
      semesterStart: semesterStartDate,
      inferDates: true,
      currentYear: new Date().getFullYear(),
      ocrEnabled: true,
      timezone: "America/New_York",
      userId: ownerId
    };

    const result = await parseSyllabus(
      req.file.buffer,
      req.file.originalname,
      parserOptions
    );

    // ---------- 6) UPDATE CLASS WITH BASIC INFO (no parsedSyllabus) ----------
    const parsedData = result.toDict();
    
    // Update class with basic syllabus information only
    const updateData = {};
    if (parsedData.term) updateData.term = parsedData.term;
    if (parsedData.instructor) updateData.instructor = parsedData.instructor;
    if (parsedData.meetingDays?.length > 0) updateData.meetingDays = parsedData.meetingDays;
    if (parsedData.startTime && parsedData.endTime) {
      updateData.meetingTime = `${parsedData.startTime}-${parsedData.endTime}`;
    }
    updateData.lastSyllabusImportedAt = new Date();
    
    if (Object.keys(updateData).length > 0) {
      await Class.findByIdAndUpdate(classId, { $set: updateData });
    }

    // ---------- 7) SAVE EVENTS TO USER CALENDAR ----------
    let eventsAdded = 0;
    let eventsRemoved = 0;
    
    if (parsedData.events && parsedData.events.length > 0) {
      const user = await User.findById(ownerId);
      if (user) {
        // Remove previous syllabus events for this class
        const previousSyllabusEvents = user.calendar.filter(event => 
          event.origin === 'syllabus' && 
          event.classId && 
          event.classId.toString() === classId
        );

        if (previousSyllabusEvents.length > 0) {
          user.calendar = user.calendar.filter(event => 
            !(event.origin === 'syllabus' && event.classId && event.classId.toString() === classId)
          );
          eventsRemoved = previousSyllabusEvents.length;
        }

        // Add new events
        const eventsToAdd = parsedData.events.map(event => ({
          classId: new mongoose.Types.ObjectId(classId),
          title: event.title,
          start: new Date(event.start),
          end: new Date(event.end),
          type: event.type || 'assignment',
          class: event.class || cls.name,
          location: event.location || '',
          reminders: event.reminders || [],
          origin: 'syllabus'
        }));

        user.calendar.push(...eventsToAdd);
        await user.save();
        eventsAdded = eventsToAdd.length;
      }
    }

    console.log(`Syllabus parsing completed for class: ${cls.name}`);
    console.log(`Extracted ${parsedData.events.length} events, added ${eventsAdded}, removed ${eventsRemoved}`);

    // ---------- 8) RETURN SUCCESS RESPONSE ----------
    return res.status(200).json({
      message: "Syllabus parsed successfully",
      data: {
        classId: classId,
        className: parsedData.className,
        term: parsedData.term,
        instructor: parsedData.instructor,
        meetingDays: parsedData.meetingDays,
        meetingTime: `${parsedData.startTime} - ${parsedData.endTime}`,
        eventsCount: parsedData.events.length,
        eventsAdded: eventsAdded,
        eventsRemoved: eventsRemoved,
        events: parsedData.events,
        processingTime: result.processingTime,
        cost: result.totalCost
      }
    });

  } catch (error) {
    console.error('Syllabus parsing error:', error);
    
    // Handle specific error types
    if (error.message.includes('File validation failed')) {
      return res.status(400).json({ 
        message: "File validation failed", 
        error: error.message 
      });
    }
    
    if (error.message.includes('Text extraction failed')) {
      return res.status(400).json({ 
        message: "Text extraction failed", 
        error: "Unable to extract text from the uploaded file. Please ensure the file is readable and in a supported format." 
      });
    }
    
    if (error.message.includes('API key')) {
      return res.status(500).json({ 
        message: "Configuration error", 
        error: "OpenAI API key not configured" 
      });
    }
    
    if (error.message.includes('rate limit')) {
      return res.status(429).json({ 
        message: "Rate limit exceeded", 
        error: "Too many requests. Please try again later." 
      });
    }

    return res.status(500).json({ 
      message: "Syllabus parsing failed", 
      error: error.message 
    });
  }
};

/**
 * Get syllabus events for a class (from User.calendar)
 */
export const getSyllabus = async (req, res) => {
  try {
    const { classId } = req.params;
    const ownerId = req.user?.id;
    
    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!classId || !mongoose.isValidObjectId(classId)) {
      return res.status(400).json({ message: "Invalid classId" });
    }

    // Verify class ownership
    const cls = await Class.findOne({ _id: classId, ownerId })
      .select('name term instructor meetingDays meetingTime lastSyllabusImportedAt');
    
    if (!cls) {
      return res.status(404).json({ message: "Class not found or unauthorized" });
    }

    // Get syllabus events from user's calendar
    const user = await User.findById(ownerId).select('calendar');
    const syllabusEvents = user?.calendar?.filter(event => 
      event.origin === 'syllabus' && 
      event.classId && 
      event.classId.toString() === classId
    ) || [];

    if (syllabusEvents.length === 0 && !cls.lastSyllabusImportedAt) {
      return res.status(404).json({ message: "No syllabus data found for this class" });
    }

    return res.status(200).json({
      message: "Syllabus retrieved successfully",
      data: {
        classId: cls._id,
        className: cls.name,
        term: cls.term,
        instructor: cls.instructor,
        meetingDays: cls.meetingDays,
        meetingTime: cls.meetingTime,
        lastImportedAt: cls.lastSyllabusImportedAt,
        events: syllabusEvents,
        eventsCount: syllabusEvents.length
      }
    });

  } catch (error) {
    console.error('Get syllabus error:', error);
    return res.status(500).json({ 
      message: "Failed to retrieve syllabus", 
      error: error.message 
    });
  }
};

/**
 * Delete syllabus events for a class (from User.calendar)
 */
export const deleteSyllabus = async (req, res) => {
  try {
    const { classId } = req.params;
    const ownerId = req.user?.id;
    
    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!classId || !mongoose.isValidObjectId(classId)) {
      return res.status(400).json({ message: "Invalid classId" });
    }

    // Verify class ownership
    const cls = await Class.findOne({ _id: classId, ownerId });
    if (!cls) {
      return res.status(404).json({ message: "Class not found or unauthorized" });
    }

    // Remove syllabus events from user's calendar
    const user = await User.findById(ownerId);
    if (user) {
      const initialLength = user.calendar.length;
      user.calendar = user.calendar.filter(event => 
        !(event.origin === 'syllabus' && event.classId && event.classId.toString() === classId)
      );
      const removedCount = initialLength - user.calendar.length;
      
      if (removedCount > 0) {
        await user.save();
      }

      // Clear last import timestamp
      await Class.findByIdAndUpdate(classId, {
        $unset: { lastSyllabusImportedAt: 1 }
      });

      return res.status(200).json({
        message: `Syllabus deleted successfully. Removed ${removedCount} events.`,
        eventsRemoved: removedCount
      });
    }

    return res.status(200).json({
      message: "Syllabus deleted successfully"
    });

  } catch (error) {
    console.error('Delete syllabus error:', error);
    return res.status(500).json({ 
      message: "Failed to delete syllabus", 
      error: error.message 
    });
  }
};

/**
 * Get syllabus events for calendar integration (from User.calendar)
 */
export const getSyllabusEvents = async (req, res) => {
  try {
    const { classId } = req.params;
    const ownerId = req.user?.id;
    
    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!classId || !mongoose.isValidObjectId(classId)) {
      return res.status(400).json({ message: "Invalid classId" });
    }

    // Verify class ownership
    const cls = await Class.findOne({ _id: classId, ownerId })
      .select('name');
    
    if (!cls) {
      return res.status(404).json({ message: "Class not found or unauthorized" });
    }

    // Get syllabus events from user's calendar
    const user = await User.findById(ownerId).select('calendar');
    const syllabusEvents = user?.calendar?.filter(event => 
      event.origin === 'syllabus' && 
      event.classId && 
      event.classId.toString() === classId
    ) || [];

    if (syllabusEvents.length === 0) {
      return res.status(404).json({ message: "No syllabus events found for this class" });
    }

    // Return events in calendar format
    const events = syllabusEvents.map(event => ({
      id: event._id,
      title: event.title,
      start: event.start,
      end: event.end,
      type: event.type,
      location: event.location,
      reminders: event.reminders,
      className: cls.name,
      source: 'syllabus'
    }));

    return res.status(200).json({
      message: "Syllabus events retrieved successfully",
      data: {
        classId: cls._id,
        className: cls.name,
        events: events,
        totalEvents: events.length
      }
    });

  } catch (error) {
    console.error('Get syllabus events error:', error);
    return res.status(500).json({ 
      message: "Failed to retrieve syllabus events", 
      error: error.message 
    });
  }
};
