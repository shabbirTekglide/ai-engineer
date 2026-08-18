// controllers/comprehensionController.js
import mongoose from "mongoose";
import Lecture from "../models/lecture.js";
import { processComprehensionAudio, processComprehensionText } from "../services/comprehensionService.js";

/**
 * Assess comprehension through speech-to-speech interaction
 * POST /api/comprehension/assess
 */
export const assessComprehension = async (req, res) => {
  try {
    // ========== 1. AUTHENTICATION & VALIDATION ==========
    const ownerId = req.user?.id;
    if (!ownerId) {
      return res.status(401).json({ 
        success: false,
        message: "Unauthorized" 
      });
    }

    // Get classId and lectureIds from form data
    const { classId } = req.body;
    let lectureIds;
    
    try {
      lectureIds = JSON.parse(req.body.lectureIds);
    } catch (e) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid lectureIds format" 
      });
    }

    if (!classId || !mongoose.isValidObjectId(classId)) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid class ID" 
      });
    }

    if (!Array.isArray(lectureIds) || lectureIds.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: "Please select at least one lecture" 
      });
    }

    // Validate all lecture IDs
    for (const lectureId of lectureIds) {
      if (!mongoose.isValidObjectId(lectureId)) {
        return res.status(400).json({ 
          success: false,
          message: `Invalid lecture ID: ${lectureId}` 
        });
      }
    }

    if (!req.file?.buffer) {
      return res.status(400).json({ 
        success: false,
        message: "Audio file is required" 
      });
    }

    // Validate audio format (common audio types)
    const allowedMimeTypes = [
      'audio/mpeg',      // MP3
      'audio/mp3',
      'audio/wav',
      'audio/wave',
      'audio/x-wav',
      'audio/webm',
      'audio/ogg',
      'audio/mp4',
      'audio/m4a',
      'audio/x-m4a'
    ];

    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid audio format. Supported: MP3, WAV, WebM, OGG, M4A" 
      });
    }

    // ========== 2. VERIFY LECTURES OWNERSHIP ==========
    const lectures = await Lecture.find({ 
      _id: { $in: lectureIds },
      ownerId,
      classId
    }).select('title processingStatus transcript');

    if (!lectures || lectures.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Lectures not found or unauthorized" 
      });
    }

    if (lectures.length !== lectureIds.length) {
      return res.status(404).json({ 
        success: false,
        message: "One or more lectures not found or unavailable" 
      });
    }

    // Check if all lectures have been processed
    const unprocessedLectures = lectures.filter(l => l.processingStatus !== 'completed');
    if (unprocessedLectures.length > 0) {
      return res.status(400).json({ 
        success: false,
        message: `Some lectures are not fully processed yet: ${unprocessedLectures.map(l => l.title).join(', ')}`,
      });
    }

    // Check if all lectures have transcripts
    const lecturesWithoutTranscript = lectures.filter(l => !l.transcript?.text);
    if (lecturesWithoutTranscript.length > 0) {
      return res.status(400).json({ 
        success: false,
        message: `Some lectures don't have transcripts available: ${lecturesWithoutTranscript.map(l => l.title).join(', ')}` 
      });
    }

    console.log(`[Comprehension] Starting assessment for ${lectures.length} lectures`);
    console.log(`[Comprehension] Lectures: ${lectures.map(l => l.title).join(', ')}`);
    console.log(`[Comprehension] Audio size: ${req.file.size} bytes, format: ${req.file.mimetype}`);

    // ========== 3. PROCESS AUDIO & GENERATE RESPONSE ==========
    // This returns both text and audio buffer
    const response = await processComprehensionAudio(
      req.file.buffer,
      ownerId,
      classId,
      lectureIds,
      req.file.mimetype // Pass the actual audio format for correct file handling
    );

    console.log(`[Comprehension] Generated response text: ${response.text.length} chars`);
    console.log(`[Comprehension] Generated response audio: ${response.audioBuffer.length} bytes`);

    // ========== 4. RETURN JSON RESPONSE WITH BASE64 AUDIO ==========
    // Return JSON format with base64-encoded audio for both web and mobile compatibility
    return res.json({
      success: true,
      data: {
        text: response.text,
        audio: response.audioBuffer.toString('base64'),
        audioFormat: 'mp3'
      }
    });

  } catch (error) {
    console.error('[Comprehension] Assessment error:', error);
    
    // Handle specific error types
    let statusCode = 500;
    let message = "Server error during comprehension assessment";

    if (error.message.includes('OpenAI')) {
      statusCode = 502;
      message = "AI service error. Please try again.";
    } else if (error.message.includes('transcription')) {
      statusCode = 400;
      message = "Could not understand audio. Please speak clearly and try again.";
    } else if (error.message.includes('timeout')) {
      statusCode = 504;
      message = "Request timeout. Please try again with a shorter question.";
    }

    return res.status(statusCode).json({ 
      success: false,
      message,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Text-based comprehension assessment
 * POST /api/comprehension/assess-text
 */
export const assessComprehensionText = async (req, res) => {
  try {
    // ========== 1. AUTHENTICATION & VALIDATION ==========
    const ownerId = req.user?.id;
    if (!ownerId) {
      return res.status(401).json({ 
        success: false,
        message: "Unauthorized" 
      });
    }

    const { classId, lectureIds, question, includeAudio } = req.body;

    if (!classId || !mongoose.isValidObjectId(classId)) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid class ID" 
      });
    }

    if (!Array.isArray(lectureIds) || lectureIds.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: "Please select at least one lecture" 
      });
    }

    // Validate all lecture IDs
    for (const lectureId of lectureIds) {
      if (!mongoose.isValidObjectId(lectureId)) {
        return res.status(400).json({ 
          success: false,
          message: `Invalid lecture ID: ${lectureId}` 
        });
      }
    }

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return res.status(400).json({ 
        success: false,
        message: "Question text is required" 
      });
    }

    if (question.length > 2000) {
      return res.status(400).json({ 
        success: false,
        message: "Question is too long. Maximum 2000 characters allowed." 
      });
    }

    // ========== 2. VERIFY LECTURES OWNERSHIP ==========
    const lectures = await Lecture.find({ 
      _id: { $in: lectureIds },
      ownerId,
      classId
    }).select('title processingStatus transcript');

    if (!lectures || lectures.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Lectures not found or unauthorized" 
      });
    }

    if (lectures.length !== lectureIds.length) {
      return res.status(404).json({ 
        success: false,
        message: "One or more lectures not found or unavailable" 
      });
    }

    // Check if all lectures have been processed
    const unprocessedLectures = lectures.filter(l => l.processingStatus !== 'completed');
    if (unprocessedLectures.length > 0) {
      return res.status(400).json({ 
        success: false,
        message: `Some lectures are not fully processed yet: ${unprocessedLectures.map(l => l.title).join(', ')}`,
      });
    }

    // Check if all lectures have transcripts
    const lecturesWithoutTranscript = lectures.filter(l => !l.transcript?.text);
    if (lecturesWithoutTranscript.length > 0) {
      return res.status(400).json({ 
        success: false,
        message: `Some lectures don't have transcripts available: ${lecturesWithoutTranscript.map(l => l.title).join(', ')}` 
      });
    }

    console.log(`[Comprehension] Starting text assessment for ${lectures.length} lectures`);
    console.log(`[Comprehension] Lectures with transcript info:`);
    lectures.forEach((l, i) => {
      console.log(`  ${i + 1}. "${l.title}" - Transcript: ${l.transcript?.text?.length || 0} chars, Status: ${l.processingStatus}`);
    });
    console.log(`[Comprehension] Question: "${question.substring(0, 100)}..."`);

    // ========== 3. PROCESS TEXT & GENERATE RESPONSE ==========
    const response = await processComprehensionText(
      question,
      ownerId,
      classId,
      lectureIds,
      includeAudio === true
    );

    console.log(`[Comprehension] Generated text response: ${response.text.length} chars`);

    // ========== 4. RETURN RESPONSE ==========
    // If audio was requested, return as multipart or base64
    if (includeAudio && response.audioBuffer) {
      return res.json({
        success: true,
        data: {
          text: response.text,
          audio: response.audioBuffer.toString('base64'),
          audioFormat: 'mp3'
        }
      });
    }

    // Text-only response
    return res.json({
      success: true,
      data: {
        text: response.text
      }
    });

  } catch (error) {
    console.error('[Comprehension] Text assessment error:', error);
    
    let statusCode = 500;
    let message = "Server error during comprehension assessment";

    if (error.message.includes('OpenAI')) {
      statusCode = 502;
      message = "AI service error. Please try again.";
    } else if (error.message.includes('timeout')) {
      statusCode = 504;
      message = "Request timeout. Please try again.";
    }

    return res.status(statusCode).json({ 
      success: false,
      message,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

