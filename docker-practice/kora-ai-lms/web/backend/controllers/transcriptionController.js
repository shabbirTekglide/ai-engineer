/**
 * Transcription Controller
 * =======================
 * 
 * Controller for transcription processing operations
 * Handles status checking, progress tracking, and retry logic
 */

import mongoose from "mongoose";
import Lecture from "../models/lecture.js";
import EnhancedTranscriptionProcessor from "../services/enhancedTranscriptionProcessor.js";

// Global processor instance
const transcriptionProcessor = new EnhancedTranscriptionProcessor({
  openaiApiKey: process.env.OPENAI_API_KEY,
  mistralApiKey: process.env.MISTRAL_API_KEY,
  velmaApiKey: process.env.VELMA_API_KEY
});

/**
 * GET /api/transcription/:lectureId/status
 * Get transcription processing status
 */
export const getTranscriptionStatus = async (req, res) => {
  try {
    const { lectureId } = req.params;
    const ownerId = req.user?.id;
    
    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    if (!mongoose.isValidObjectId(lectureId)) {
      return res.status(400).json({ message: "Invalid lecture ID" });
    }
    
    // Find lecture and verify ownership
    const lecture = await Lecture.findOne({ 
      _id: lectureId, 
      ownerId 
    }).select('title processingStatus processingError transcript notes quiz flashCards createdAt');
    
    if (!lecture) {
      return res.status(404).json({ message: "Lecture not found or unauthorized" });
    }
    
    // Get processing status from processor
    const processorStatus = await transcriptionProcessor.getProcessingStatus(lectureId);
    
    // Prepare response
    const response = {
      lectureId: lecture._id,
      title: lecture.title,
      status: lecture.processingStatus,
      isProcessing: processorStatus.isProcessing,
      error: lecture.processingError,
      createdAt: lecture.createdAt,
      hasTranscript: !!(lecture.transcript && lecture.transcript.text),
      hasNotes: !!(lecture.notes && lecture.notes.overview),
      hasQuiz: !!(lecture.quiz && lecture.quiz.questions && lecture.quiz.questions.length > 0),
      hasFlashcards: !!(lecture.flashCards && lecture.flashCards.cards && lecture.flashCards.cards.length > 0)
    };
    
    // Add transcript stats if available
    if (lecture.transcript) {
      response.transcriptStats = {
        wordCount: lecture.transcript.wordCount || 0,
        language: lecture.transcript.language || 'en',
        confidence: lecture.transcript.asr?.confidence || 0,
        model: lecture.transcript.asr?.model || 'unknown'
      };
    }
    
    return res.status(200).json({
      success: true,
      data: response
    });
    
  } catch (err) {
    console.error('Get transcription status error:', err);
    return res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: err.message 
    });
  }
};

/**
 * GET /api/transcription/:lectureId/progress
 * Get real-time transcription progress
 */
export const getTranscriptionProgress = async (req, res) => {
  try {
    const { lectureId } = req.params;
    const ownerId = req.user?.id;
    
    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    if (!mongoose.isValidObjectId(lectureId)) {
      return res.status(400).json({ message: "Invalid lecture ID" });
    }
    
    // Find lecture and verify ownership
    const lecture = await Lecture.findOne({ 
      _id: lectureId, 
      ownerId 
    }).select('processingStatus');
    
    if (!lecture) {
      return res.status(404).json({ message: "Lecture not found or unauthorized" });
    }
    
    // Check if currently processing
    if (lecture.processingStatus !== 'processing') {
      return res.status(400).json({ 
        message: "Lecture is not currently being processed",
        status: lecture.processingStatus
      });
    }
    
    // Set up Server-Sent Events for real-time progress
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });
    
    // Send initial connection message
    res.write(`data: ${JSON.stringify({
      type: 'connected',
      lectureId: lectureId,
      timestamp: new Date().toISOString()
    })}\n\n`);
    
    // Set up progress tracking
    let progressInterval;
    let lastProgress = null;
    
    const sendProgress = () => {
      const currentStatus = transcriptionProcessor.getProcessingStatus(lectureId);
      
      if (currentStatus.status === 'completed' || currentStatus.status === 'failed') {
        // Processing finished
        res.write(`data: ${JSON.stringify({
          type: 'completed',
          status: currentStatus.status,
          error: currentStatus.error,
          timestamp: new Date().toISOString()
        })}\n\n`);
        
        res.end();
        if (progressInterval) {
          clearInterval(progressInterval);
        }
        return;
      }
      
      // Send progress update if changed
      const progressData = {
        type: 'progress',
        lectureId: lectureId,
        isProcessing: currentStatus.isProcessing,
        timestamp: new Date().toISOString()
      };
      
      if (JSON.stringify(progressData) !== JSON.stringify(lastProgress)) {
        res.write(`data: ${JSON.stringify(progressData)}\n\n`);
        lastProgress = progressData;
      }
    };
    
    // Send progress updates every 2 seconds
    progressInterval = setInterval(sendProgress, 2000);
    
    // Send initial progress
    sendProgress();
    
    // Handle client disconnect
    req.on('close', () => {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
    });
    
  } catch (err) {
    console.error('Get transcription progress error:', err);
    
    if (!res.headersSent) {
      return res.status(500).json({ 
        success: false,
        message: "Server error", 
        error: err.message 
      });
    } else {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: err.message,
        timestamp: new Date().toISOString()
      })}\n\n`);
      res.end();
    }
  }
};

/**
 * POST /api/transcription/:lectureId/retry
 * Retry failed transcription
 */
export const retryTranscription = async (req, res) => {
  try {
    const { lectureId } = req.params;
    const ownerId = req.user?.id;
    
    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    if (!mongoose.isValidObjectId(lectureId)) {
      return res.status(400).json({ message: "Invalid lecture ID" });
    }
    
    // Find lecture and verify ownership
    const lecture = await Lecture.findOne({ 
      _id: lectureId, 
      ownerId 
    }).select('processingStatus processingError audioUrl');
    
    if (!lecture) {
      return res.status(404).json({ message: "Lecture not found or unauthorized" });
    }
    
    // Check if lecture can be retried
    if (lecture.processingStatus === 'processing') {
      return res.status(400).json({ 
        message: "Lecture is currently being processed",
        status: lecture.processingStatus
      });
    }
    
    if (lecture.processingStatus === 'completed') {
      return res.status(400).json({ 
        message: "Lecture has already been successfully processed",
        status: lecture.processingStatus
      });
    }
    
    if (!lecture.audioUrl) {
      return res.status(400).json({ 
        message: "Lecture has no audio file to process"
      });
    }
    
    // Reset processing status
    lecture.processingStatus = 'pending';
    lecture.processingError = null;
    await lecture.save();
    
    // Start background processing
    const { processTranscriptionAsync } = await import('../services/enhancedTranscriptionProcessor.js');
    processTranscriptionAsync(lectureId, {
      userId: ownerId,
      onProgress: (progress) => {
        console.log(`Retry progress for ${lectureId}:`, progress);
      }
    });
    
    return res.status(200).json({
      success: true,
      message: "Transcription retry started",
      status: 'pending'
    });
    
  } catch (err) {
    console.error('Retry transcription error:', err);
    return res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: err.message 
    });
  }
};

/**
 * DELETE /api/transcription/:lectureId/cancel
 * Cancel ongoing transcription
 */
export const cancelTranscription = async (req, res) => {
  try {
    const { lectureId } = req.params;
    const ownerId = req.user?.id;
    
    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    if (!mongoose.isValidObjectId(lectureId)) {
      return res.status(400).json({ message: "Invalid lecture ID" });
    }
    
    // Find lecture and verify ownership
    const lecture = await Lecture.findOne({ 
      _id: lectureId, 
      ownerId 
    }).select('processingStatus');
    
    if (!lecture) {
      return res.status(404).json({ message: "Lecture not found or unauthorized" });
    }
    
    // Check if lecture is currently processing
    if (lecture.processingStatus !== 'processing') {
      return res.status(400).json({ 
        message: "Lecture is not currently being processed",
        status: lecture.processingStatus
      });
    }
    
    // Update status to cancelled
    lecture.processingStatus = 'cancelled';
    lecture.processingError = 'Processing cancelled by user';
    await lecture.save();
    
    // Note: We can't actually cancel the OpenAI API call once it's started,
    // but we can mark it as cancelled in our database
    
    return res.status(200).json({
      success: true,
      message: "Transcription cancelled",
      status: 'cancelled'
    });
    
  } catch (err) {
    console.error('Cancel transcription error:', err);
    return res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: err.message 
    });
  }
};
