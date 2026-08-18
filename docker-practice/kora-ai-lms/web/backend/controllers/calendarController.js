// controllers/calendarController.js
import mongoose from 'mongoose';
import User from '../models/User.js';
import Class from "../models/class.js";
export const createCalendar = async (req, res) => {
  console.log("🚀 ~ createCalendar ~ req.body:", req.body)
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    // Use validated data from middleware
    const {
      title,
      start,
      end,
      type = "class",
      class: className,
      location,
      reminders = [],
      classId
    } = req.body;

    // Normalize reminders as an array
    const normalizedReminders = Array.isArray(reminders) ? [...reminders] : [];
    // Add default reminder 24 hours (1440 minutes) before 
    normalizedReminders.push({ minutesBefore: 1440 });

    // Create the calendar event object
    const calendarEvent = {
      _id: new mongoose.Types.ObjectId(), // Generate ID for the subdocument
      title,
      classId: classId === 'personal' ? null : classId,
      start: new Date(start),
      end: new Date(end),
      type,
      class: className,
      location,
      // reminders,
      reminders: normalizedReminders,

    };

    // OPTION 1: Using findById + save (Recommended for complex operations)
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    // Fetch class color if classId exists and is not 'personal'
    let classColor = null;
    if (classId && classId !== 'personal') {
      try {
        const classDoc = await Class.findOne({
          _id: classId,
          ownerId: userId
        }).select('color');

        if (classDoc && classDoc.color) {
          classColor = classDoc.color;
        }
      } catch (classErr) {
        console.error('Error fetching class color:', classErr);
        // Continue without color - it's optional
      }
    }

    // Add event to user's calendar
    user.calendar.push(calendarEvent);
    await user.save();

    // Get the newly created event
    const createdEvent = user.calendar.id(calendarEvent._id).toObject();

    // Clean up the response
    const { __v, ...eventWithoutVersion } = createdEvent;

    return res.status(201).json({
      success: true,
      message: "Event created successfully",
      event: {
        ...eventWithoutVersion,
        classColor: classColor // Ensure it's included
      }
    });

  } catch (error) {
    console.error('Create event error:', error);

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};


export const getCalendarEvents = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const user = await User.findById(userId).select('calendar');
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const classes = await Class.find({ ownerId: userId }).select('_id name color');
    const classColorMap = {};
    classes.forEach(cls => {
      classColorMap[cls._id.toString()] = cls.color;
    });

    // Sort events by date in descending order (most recent first)
    const sortedEvents = user.calendar.map((event) => {
      // Create a copy of the event object
      const eventWithColor = { ...event.toObject ? event.toObject() : event };

      // Agar event mein classId hai aur woh classColorMap mein exist karta hai
      if (eventWithColor.classId && classColorMap[eventWithColor.classId.toString()]) {
        // Class ka color add karein
        eventWithColor.classColor = classColorMap[eventWithColor.classId.toString()];

        // Class ka naam bhi add karein (optional)
        const matchedClass = classes.find(cls => cls._id.toString() === eventWithColor.classId.toString());
        if (matchedClass) {
          eventWithColor.className = matchedClass.name;
        }
      }

      return eventWithColor;
    }).sort((a, b) => {
      // Convert dates to timestamps for comparison
      const dateA = new Date(a.start || a.date).getTime();
      const dateB = new Date(b.start || b.date).getTime();

      // For descending order (most recent first): b - a
      return dateA - dateB;
    });

    return res.status(200).json({
      success: true,
      message: "Calendar events retrieved successfully",
      events: sortedEvents
    });

  } catch (error) {
    console.error('Get calendar events error:', error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

export const updateCalendarEvent = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { eventId } = req.validParams;

    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    // Use validated data from middleware
    const updateData = req.body;
    console.log('updated data', updateData)
    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Find the event in user's calendar
    const event = user.calendar.id(eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    // Update fields
    if (updateData.title !== undefined) event.title = updateData.title;
    if (updateData.start !== undefined) event.start = new Date(updateData.start);
    if (updateData.end !== undefined) event.end = new Date(updateData.end);
    if (updateData.type !== undefined) event.type = updateData.type;
    if (updateData.class !== undefined) event.class = updateData.class;
    if (updateData.location !== undefined) event.location = updateData.location;
    if (updateData.reminders !== undefined) {
      let updatedReminders = Array.isArray(updateData.reminders) ? [...updateData.reminders] : [];

      event.reminders = updatedReminders;
    }
    if (updateData.classId !== undefined) event.classId = updateData.classId == 'personal' ? null : updateData.classId;
    if (event.origin === 'syllabus') {
      event.origin = 'manual';
      console.log(`Changed event "${event.title}" from syllabus to manual origin`);
    }
    await user.save();
    // Fetch class color if classId exists and is not 'personal'
    let classColor = null;
    if (event.classId && event.classId !== 'personal') {
      try {
        const classDoc = await Class.findOne({
          _id: event.classId,
          ownerId: userId
        }).select('color');

        if (classDoc && classDoc.color) {
          classColor = classDoc.color;
        }
      } catch (classErr) {
        console.error('Error fetching class color:', classErr);
        // Continue without color - it's optional
      }
    }

    return res.status(200).json({
      success: true,
      message: "Event updated successfully",
      event: {
        ...event.toObject(),
        classColor: classColor // Ensure it's included
      }
    });

  } catch (error) {
    console.error('Update event error:', error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

export const deleteCalendarEvent = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { eventId } = req.validParams;

    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Remove event from calendar array
    const event = user.calendar.id(eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    user.calendar.pull({ _id: eventId });
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Event deleted successfully"
    });

  } catch (error) {
    console.error('Delete event error:', error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

export const getEventsInRange = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { startDate, endDate } = req.validated; // From query validation

    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const user = await User.findById(userId).select('calendar');
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Filter events within the date range
    const start = new Date(startDate);
    const end = new Date(endDate);

    const eventsInRange = user.calendar.filter(event => {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);
      return eventStart >= start && eventEnd <= end;
    });

    return res.status(200).json({
      success: true,
      message: "Events retrieved successfully",
      events: eventsInRange,
      count: eventsInRange.length
    });

  } catch (error) {
    console.error('Get events in range error:', error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};
