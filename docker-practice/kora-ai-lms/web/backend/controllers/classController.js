// controllers/classController.js
import mongoose from "mongoose";
import Class from "../models/class.js";
import { uploadSyllabusToS3 } from "../services/syllabusUploader.js";
import { parseSyllabus } from "../services/enhancedSyllabusParser.js";
import User from "../models/User.js"
import lecture from "../models/lecture.js";
import ChatThread from '../models/chatThreads.js';
import { setTimeout } from 'timers/promises';
import { sanitize } from '../utils/sanitize.js';
import { formatTo12Hour } from "../utils/helpers.js";
import s3 from "../config/s3-storage.js";
import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
// Helper function for success messages
function getSuccessMessage(added, removed) {
  if (added > 0 && removed > 0) {
    return `Syllabus uploaded. Replaced ${removed} old syllabus events with ${added} new events.`;
  } else if (added > 0) {
    return `Syllabus uploaded and ${added} events added to calendar.`;
  } else if (removed > 0) {
    return `Syllabus uploaded. ${removed} old syllabus events removed (no new events found).`;
  } else {
    return 'Syllabus uploaded successfully (no calendar changes).';
  }
}
// Timeout configuration for syllabus parsing (35 minutes total)
const SYLLABUS_PARSING_TIMEOUT_MS = parseInt(process.env.SYLLABUS_PARSING_TIMEOUT_MS) || 35 * 60 * 1000; // 35 minutes

const parserOptions = {
  semesterStart: null,
  inferDates: true,
  currentYear: new Date().getFullYear(),
  ocrEnabled: true,
  timezone: "America/New_York"
};
/**
 * Create Class
 * - requires req.user.id from your auth middleware
 * - validates with Zod before this (recommended)
 */
export const createClass = async (req, res) => {
  let classDoc = null;

  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    // Get data from validated body or req.body
    const {
      className,
      term,
      color,
      meetingDays,
      startTime,
      endTime,
      instructor,
      events
    } = req.validated || req.body || {};

    // Ensure unique by (ownerId + nameKey)
    const nameKey = String(className).trim().toLowerCase();
    const exists = await Class.exists({ ownerId: userId, nameKey });
    if (exists) {
      return res.status(409).json({ success: false, message: "Class with this name already exists" });
    }

    const meetingTime = startTime && endTime ? `${formatTo12Hour(startTime)}-${formatTo12Hour(endTime)}` : undefined;

    // Create class first (without syllabus)
    classDoc = await Class.create({
      ownerId: userId,
      name: className.trim(),
      nameKey: nameKey,
      term: term || undefined,
      color: color || 50,
      syllabus: undefined,
      meetingDays: meetingDays || [],
      instructor: instructor || undefined,
      meetingTime,
    });

    let syllabusUrl = '';

    // Handle file upload AFTER class creation
    if (req.file) {
      // Get user for email
      const user = await User.findById(userId).select('email');
      const userEmail = user?.email;

      // Use class name or nameKey for Cloudinary
      const classNameForUpload = classDoc.nameKey;

      // Upload syllabus to Cloudinary
      const uploadResult = await uploadSyllabusToS3({
        buffer: req.file.buffer,
        mimetype: req.file.mimetype,
        userEmail: userEmail,
        className: classNameForUpload
      });

      syllabusUrl = uploadResult.secure_url || '';
      if (!syllabusUrl) {
        throw new Error("Syllabus upload returned no secure_url");
      }
      // Update class with syllabus URL
      classDoc.syllabus = syllabusUrl;
      await classDoc.save();
    }

    // Add events to user's calendar if provided
    let eventsAdded = 0;
    if (events && events.length > 0) {
      const user = await User.findById(userId);
      if (user) {
        // Format events according to CalendarEventSchema
        const eventsWithClass = events.map(event => {
          let startStr = new Date(event.start).toISOString();
          if (startTime) {
            startStr = startStr.split('T')[0] + 'T' + startTime + ':00.000Z';
          }

          let endStr = new Date(event.end).toISOString();
          if (endTime) {
            endStr = endStr.split('T')[0] + 'T' + endTime + ':00.000Z';
          }

          const normalizedReminders = Array.isArray(event.reminders) ? [...event.reminders] : [];
          normalizedReminders.push({ minutesBefore: 1440 });

          return {
            classId: classDoc._id,
            title: event.title,
            start: new Date(startStr),
            end: new Date(endStr),
            type: event.type || 'class',
            class: event.class || classDoc.name,
            location: event.location || '',
            reminders: normalizedReminders,
            origin: "syllabus"
          };
        });

        console.log('Events to add:', eventsWithClass);

        // Remove any existing syllabus events for this class before adding new ones
        const existingSyllabusEvents = user.calendar.filter(event =>
          event.origin === 'syllabus' &&
          event.classId &&
          event.classId.toString() === classDoc._id.toString()
        );

        if (existingSyllabusEvents.length > 0) {
          user.calendar = user.calendar.filter(event =>
            !(event.origin === 'syllabus' && event.classId && event.classId.toString() === classDoc._id.toString())
          );
          console.log(`Removed ${existingSyllabusEvents.length} existing syllabus events for this class`);
        }

        // Add new events
        user.calendar.push(...eventsWithClass);
        await user.save();
        eventsAdded = eventsWithClass.length;
      }
    }

    return res.status(201).json({
      success: true,
      message: "Class created successfully",
      class: classDoc.toJSON(),
      eventsAdded: eventsAdded,
      syllabusUploaded: !!syllabusUrl
    });

  } catch (error) {
    // If class was created but something else failed, delete the class
    if (classDoc) {
      await Class.findByIdAndDelete(classDoc._id);
    }

    // handle duplicate key from unique index
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: "Class with this name already exists" });
    }
    console.error('Create class error:', error);
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

export const getClasses = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const classes = await Class.find({ ownerId: userId })
      .sort({ createdAt: -1 })
      .lean({ virtuals: true });

    return res.status(200).json({ classes });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};


export const getClassById = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { classId } = req.params;
    if (!classId) return res.status(400).json({ message: 'Class ID is required' });

    const classItem = await Class.findOne({ _id: classId, ownerId: userId });
    if (!classItem) return res.status(404).json({ message: 'Class not found' });
    res.status(200).json({ class: classItem });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const attachSyllabusCloud = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { classId } = req.params;

    // Validation
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!mongoose.isValidObjectId(classId)) {
      return res.status(400).json({ success: false, message: 'Invalid class id' });
    }

    // File validation
    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'image/png',
      'image/jpeg',
    ];

    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Supported types: PDF, PNG, JPG'
      });
    }

    // Find class and verify ownership
    const cls = await Class.findOne({ _id: classId, ownerId: userId });
    if (!cls) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }

    // Get user info
    const user = await User.findById(userId).select('username email calendar');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Prepare upload parameters
    const userEmail = user?.email || userId;
    const className = cls.nameKey || cls.name;

    console.log('Uploading syllabus to Cloudinary for class:', cls.name);
    console.log('File:', req.file);
    // Upload to Cloudinary
    const result = await uploadSyllabusToS3({
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      userEmail: userEmail,
      className: className,
    });

    if (!result?.secure_url) {
      return res.status(500).json({ success: false, message: 'Failed to upload syllabus' });
    }

    // Save syllabus URL to class
    cls.syllabus = result.secure_url;
    await cls.save();

    console.log('Syllabus uploaded successfully, URL:', result.secure_url);

    // Parse syllabus using Python script
    console.log('Starting syllabus parsing with Python script...');
    console.log('File:', req.file.originalname, 'Size:', req.file.size, 'bytes');

    let classDetails = null;
    let eventsAdded = 0;
    let eventsRemoved = 0;


    try {
      console.log('File:', req.file);
      let filenameForParsing = req.file.originalname;
      
      // Fix for filenames that got stripped by Multer (e.g. .pdf)
      if (filenameForParsing.startsWith('.')) {
        filenameForParsing = 'syllabus' + filenameForParsing;
      }
      
      const mimeToExt = {
        'application/pdf': '.pdf',
        'image/png': '.png',
        'image/jpeg': '.jpg'
      };
      const expectedExt = mimeToExt[req.file.mimetype];
      
      if (expectedExt && !filenameForParsing.toLowerCase().endsWith(expectedExt)) {
        filenameForParsing += expectedExt;
      }

      // Wrap parsing in timeout to prevent indefinite hanging
      const parseWithTimeout = Promise.race([
        parseSyllabus(
          req.file.buffer,
          filenameForParsing,
          { ...parserOptions, userId: userId }
        ),
        setTimeout(SYLLABUS_PARSING_TIMEOUT_MS).then(() => {
          throw new Error('Syllabus parsing timeout. The file may be too large or complex. Processing may continue in the background.');
        })
      ]);

      const parseResult = await parseWithTimeout;
      classDetails = parseResult.toDict();
      console.log('Syllabus parsing completed successfully');
      console.log('Parsed data:', JSON.stringify(classDetails, null, 2));
      // updating the class details based on parsed data can be done here if needed
      if (classDetails.className && classDetails.className !== cls.name) {
        const newNameKey = String(classDetails.className).trim().toLowerCase();
        // Ensure another class with this name doesn't already exist for this user
        const existingClass = await Class.findOne({ ownerId: userId, nameKey: newNameKey, _id: { $ne: classId } });
        if (!existingClass) {
          cls.name = classDetails.className;
        } else {
          console.log(`Skipping class rename to ${classDetails.className} due to conflict with existing class.`);
        }
      }
      cls.term = classDetails.term || cls.term;
      cls.instructor = classDetails.instructor || cls.instructor;
      cls.meetingDays = classDetails.meetingDays || cls.meetingDays;
      cls.meetingTime = classDetails.startTime && classDetails.endTime ? `${formatTo12Hour(classDetails.startTime)}-${formatTo12Hour(classDetails.endTime)}` : cls.meetingTime;

      await cls.save();
      // Remove ALL previous syllabus events (regardless of class)
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
        console.log(`Removed ${eventsRemoved} previous syllabus events for class ${cls.name}`);
      }

      // Add extracted events to user's calendar
      if (classDetails && classDetails.events && classDetails.events.length > 0) {
        let classStartTime = classDetails.startTime;
        let classEndTime = classDetails.endTime;

        if (!classStartTime || !classEndTime) {
          if (cls.meetingTime) {
            const parts = cls.meetingTime.split('-');
            if (parts.length === 2) {
              const parse12To24 = (t) => {
                const match = t.trim().match(/(\d+):(\d+)\s*(AM|PM)/i);
                if (!match) return null;
                let h = parseInt(match[1], 10);
                const m = match[2];
                const ampm = match[3].toUpperCase();
                if (h === 12) h = ampm === 'AM' ? 0 : 12;
                else if (ampm === 'PM') h += 12;
                return `${h.toString().padStart(2, '0')}:${m}`;
              };
              classStartTime = classStartTime || parse12To24(parts[0]);
              classEndTime = classEndTime || parse12To24(parts[1]);
            }
          }
        }

        const eventsToAdd = classDetails.events.map(event => {
          let startStr = new Date(event.start).toISOString();
          if (classStartTime) {
            startStr = startStr.split('T')[0] + 'T' + classStartTime + ':00.000Z';
          }

          let endStr = new Date(event.end).toISOString();
          if (classEndTime) {
            endStr = endStr.split('T')[0] + 'T' + classEndTime + ':00.000Z';
          }

          const normalizedReminders = Array.isArray(event.reminders) ? [...event.reminders] : [];
          normalizedReminders.push({ minutesBefore: 1440 });

          return {
            classId: new mongoose.Types.ObjectId(classId),
            title: event.title,
            start: new Date(startStr),
            end: new Date(endStr),
            type: event.type || 'class',
            class: event.class || cls.name,
            location: event.location || '',
            reminders: normalizedReminders,
            origin: 'syllabus' // All parsed events get origin: 'syllabus'
          };
        });

        // Add all new events (no need for deduplication since we removed all syllabus events)
        user.calendar.push(...eventsToAdd);
        eventsAdded = eventsToAdd.length;

        console.log(`Added ${eventsAdded} new syllabus events to user calendar`);

        // Update class with import timestamp
        cls.lastSyllabusImportedAt = new Date();

        // Save both user and class
        await Promise.all([
          user.save(),
          cls.save()
        ]);

      } else {
        // No events extracted, just save the user (after removal of old syllabus events)
        await user.save();
      }

    } catch (parseError) {
      console.error('Syllabus parsing failed:', parseError);

      // Check if it's a timeout error
      if (parseError.message?.includes('timeout') || parseError.message?.includes('Timeout')) {
        console.warn('Syllabus parsing timed out. File uploaded but parsing incomplete.');
        // Continue - file is uploaded, parsing may complete later if retried
      } else {
        console.error('Syllabus parsing error:', parseError.message);
      }

      // Continue even if parsing fails - we still uploaded the file
      console.log('Continuing without parsed data...');
    }

    return res.status(200).json({
      success: true,
      message: getSuccessMessage(eventsAdded, eventsRemoved),
      asset: {
        url: result.secure_url,
        publicId: result.public_id,
        version: result.version,
        resourceType: result.resource_type,
        bytes: result.bytes,
        format: result.format,
      },
      classDetails: classDetails,
      eventsAdded: eventsAdded,
      eventsRemoved: eventsRemoved
    });

  } catch (error) {
    console.error('Syllabus upload error:', error);

    // Provide more specific error messages
    let errorMessage = 'Server error';
    if (error.message.includes('OPENAI_API_KEY')) {
      errorMessage = 'OpenAI API key is not configured';
    } else if (error.message.includes('Python')) {
      errorMessage = 'Failed to execute syllabus parser';
    } else if (error.message.includes('JSON')) {
      errorMessage = 'Failed to parse syllabus data';
    }

    return res.status(500).json({
      success: false,
      message: errorMessage,
      error: error.message
    });
  }
};

export const getClassAndLectures = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    // Get all classes for the user
    const classes = await Class.find({ ownerId: userId })
      .sort({ createdAt: -1 })
      .select('_id name term nameKey') // Only select required fields
      .lean();

    // Get lectures for all classes in parallel
    const classesWithLectures = await Promise.all(
      classes.map(async (classObj) => {
        // Find lectures for this specific class
        const lectures = await lecture.find({
          classId: classObj._id,
          ownerId: userId
        })
          .select('_id title recordedAt durationSec processingStatus sourceType') // Select only required lecture fields
          .sort({ recordedAt: -1 })
          .lean();

        return {
          ...classObj,
          lectures: lectures.map(lecture => ({
            _id: lecture._id,
            title: lecture.title,
            recordedAt: lecture.recordedAt,
            durationSec: lecture.durationSec,
            processingStatus: lecture.processingStatus,
            sourceType: lecture.sourceType
          }))
        };
      })
    );

    return res.status(200).json({
      success: true,
      message: 'Classes and lectures fetched successfully',
      data: classesWithLectures
    });

  } catch (error) {
    console.error('Get classes and lectures error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

export const extractClassFromSyllabus = async (req, res) => {
  try {
    const userId = req.user?.id;

    // Validation
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // File validation
    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'image/png',
      'image/jpeg',
      'image/tiff',
      'image/bmp'
    ];

    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Supported types: PDF, DOCX, DOC, PNG, JPG, TIFF, BMP'
      });
    }

    // Execute JavaScript syllabus parser
    console.log('Starting syllabus parsing with JavaScript parser...');
    console.log('File:', req.file.originalname, 'Size:', req.file.size, 'bytes');

    const parseResult = await parseSyllabus(
      req.file.buffer,
      req.file.originalname,
      { ...parserOptions, userId: userId }
    );
    const classDetails = parseResult.toDict();

    console.log('Syllabus parsing completed successfully');
    console.log('Parsed data:', JSON.stringify(classDetails, null, 2));

    return res.status(200).json({
      success: true,
      message: 'Syllabus extracted successfully',
      classDetails: classDetails
    });

  } catch (error) {
    console.error('Syllabus extraction error:', error);

    // Provide more specific error messages
    let errorMessage = 'Server error';
    if (error.message.includes('OPENAI_API_KEY')) {
      errorMessage = 'OpenAI API key is not configured';
    } else if (error.message.includes('Python')) {
      errorMessage = 'Failed to execute syllabus parser';
    } else if (error.message.includes('JSON')) {
      errorMessage = 'Failed to parse syllabus data';
    }

    return res.status(500).json({
      success: false,
      message: errorMessage,
      error: error.message
    });
  }
};

/**
 * Update Class
 * - requires req.user.id from your auth middleware
 * - requires classId in params
 */
export const updateClass = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { classId } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!mongoose.isValidObjectId(classId)) {
      return res.status(400).json({ success: false, message: 'Invalid class ID' });
    }

    // Find class and verify ownership
    const cls = await Class.findOne({ _id: classId, ownerId: userId });
    if (!cls) {
      return res.status(404).json({ success: false, message: 'Class not found or unauthorized' });
    }

    // Get data from validated body or req.body
    const {
      className,
      term,
      color,
      meetingDays,
      startTime,
      endTime,
      instructor,
    } = req.validated || req.body || {};

    // Build update object
    const updateData = {};

    if (className !== undefined) {
      const nameKey = String(className).trim().toLowerCase();
      // Check if nameKey already exists for another class
      const existingClass = await Class.findOne({ ownerId: userId, nameKey, _id: { $ne: classId } });
      if (existingClass) {
        return res.status(409).json({ success: false, message: 'Class with this name already exists' });
      }
      updateData.name = className.trim();
      updateData.nameKey = nameKey;
    }

    if (term !== undefined) updateData.term = term || undefined;
    if (color !== undefined) updateData.color = color || 50;
    if (meetingDays !== undefined) updateData.meetingDays = meetingDays || [];
    if (instructor !== undefined) updateData.instructor = instructor || undefined;

    // Handle meeting time
    if (startTime !== undefined && endTime !== undefined) {
      updateData.meetingTime = startTime && endTime ? `${formatTo12Hour(startTime)}-${formatTo12Hour(endTime)}` : undefined;
    } else if (startTime !== undefined || endTime !== undefined) {
      // If only one is provided, use existing value for the other
      const currentTime = cls.meetingTime ? cls.meetingTime.split('-') : ['', ''];
      const newStartTime = startTime !== undefined ? startTime : currentTime[0];
      const newEndTime = endTime !== undefined ? endTime : currentTime[1];
      updateData.meetingTime = newStartTime && newEndTime ? `${formatTo12Hour(newStartTime)}-${formatTo12Hour(newEndTime)}` : undefined;
    }

    // Update the class
    const updatedClass = await Class.findByIdAndUpdate(
      classId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: 'Class updated successfully',
      class: updatedClass
    });

  } catch (error) {
    console.error('Update class error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Delete Class
 * - requires req.user.id from your auth middleware
 * - requires classId in params
 */
export const deleteClass = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { classId } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!mongoose.isValidObjectId(classId)) {
      return res.status(400).json({ success: false, message: 'Invalid class ID' });
    }

    // 1. Find class and verify ownership
    const cls = await Class.findOne({ _id: classId, ownerId: userId });
    if (!cls) {
      return res.status(404).json({ success: false, message: 'Class not found or unauthorized' });
    }

    // Ek array banayein jese hi class find ho jye, taake baki dependent operations hum partially trigger kardein.
    const operations = [];

    // 2. Remove class-related events from user's calendar with ATOMIC $pull
    operations.push(
      User.updateOne(
        { _id: userId },
        { $pull: { calendar: { classId: classId } } }
      ).catch(e => console.error('[ClassController] Failed to update calendar:', e))
    );

    // 3. Delete cloudinary folder for this class (if configured)
    operations.push(
      (async () => {
        try {
          // fetch email if not in req.user
          const userEmail = req.user?.email || (await User.findById(userId).select('email'))?.email;
          if (!userEmail) return;

          const folderPrefix = `${sanitize(userEmail)}/${sanitize(cls.nameKey)}/`;
          console.log('[ClassController] Deleting Cloudinary resources/folder for', folderPrefix);

          if (process.env.AWS_ACCESS_KEY_ID) {
            const listParams = { Bucket: process.env.AWS_S3_BUCKET, Prefix: folderPrefix };
            const listedObjects = await s3.send(new ListObjectsV2Command(listParams));

            if (listedObjects.Contents && listedObjects.Contents.length > 0) {
              const deleteParams = {
                Bucket: process.env.AWS_S3_BUCKET,
                Delete: { Objects: listedObjects.Contents.map(({ Key }) => ({ Key })) }
              };
              await s3.send(new DeleteObjectsCommand(deleteParams));
              console.log(`[ClassController] Deleted ${listedObjects.Contents.length} objects from S3`);
            }
          }
        } catch (err) {
          console.error('[ClassController] Error deleting AWS folder:', err.message || err);
        }
      })()
    );

    // 4. Delete lectures (Parallel mapping to save sequential iteration delay)
    operations.push(
      (async () => {
        try {
          const lectures = await lecture.find({ classId: classId, ownerId: userId }).select('_id');
          // Start all deletes simultaneously
          const deletePromises = lectures.map(l =>
            lecture.findByIdAndDelete(l._id).catch(e =>
              console.error('[ClassController] Failed to delete lecture', l._id, e.message)
            )
          );
          await Promise.all(deletePromises);
        } catch (err) {
          console.error('[ClassController] Error finding/deleting lectures:', err.message || err);
        }
      })()
    );

    // 5. Delete chat threads simultaneously
    operations.push(
      ChatThread.deleteMany({ classId: classId, ownerId: userId })
        .catch(err => console.error('[ClassController] Failed to delete chat threads:', err.message))
    );

    // Run all tasks (calendar, AWS, lectures, chat-thread) CONCURRENTLY!
    await Promise.allSettled(operations);

    // Finally delete the class document
    await Class.findByIdAndDelete(classId);

    return res.status(200).json({
      success: true,
      message: 'Class deleted successfully'
    });

  } catch (error) {
    console.error('Delete class error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
