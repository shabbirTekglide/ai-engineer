// controllers/chatController.js
import ChatThread from "../models/chatThreads.js";
import { fetchChatContext } from "../services/chatContextService.js";
import { getResponsesService } from "../services/openaiResponsesService.js";

// Initialize OpenAI Responses API service with gpt-4o-mini-2024-07-18
// Using v1/responses endpoint for:
// - Stateful conversations (automatic conversation tracking)
// - 40-80% better cache utilization (reduced latency and costs)
// - Multimodal support and function calling
const responsesService = getResponsesService();

/**
 * Create a new chat thread or get existing one
 * POST /api/chat/threads
 */
export const createOrGetThread = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { context, classId, lectureId } = req.body;

    // Validate context type
    const validContexts = ['general', 'class', 'lecture'];
    if (!validContexts.includes(context)) {
      return res.status(400).json({ message: "Invalid context type" });
    }

    // Validate required IDs based on context
    if (context === 'class' && !classId) {
      return res.status(400).json({ message: "classId required for class context" });
    }
    if (context === 'lecture' && !lectureId) {
      return res.status(400).json({ message: "lectureId required for lecture context" });
    }

    // Check if thread already exists for this context
    const query = { ownerId: userId, context };
    if (classId) query.classId = classId;
    if (lectureId) query.lectureId = lectureId;

    let thread = await ChatThread.findOne(query).sort({ updatedAt: -1 });

    if (!thread) {
      // Create new thread
      const title = context === 'general' 
        ? 'General Chat'
        : context === 'class'
        ? `Class Discussion`
        : `Lecture Discussion`;

      thread = await ChatThread.create({
        ownerId: userId,
        context,
        classId: classId || undefined,
        lectureId: lectureId || undefined,
        title,
        messages: []
      });
    }

    return res.status(200).json({
      success: true,
      thread: {
        _id: thread._id,
        context: thread.context,
        classId: thread.classId,
        lectureId: thread.lectureId,
        title: thread.title,
        messages: thread.messages,
        messageCount: thread.messages.length,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt
      }
    });

  } catch (error) {
    console.error('Create/Get thread error:', error);
    return res.status(500).json({ 
      message: "Server error", 
      error: error.message 
    });
  }
};

/**
 * Get all threads for a user
 * GET /api/chat/threads
 */
export const getUserThreads = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { context, classId, lectureId } = req.query;

    const query = { ownerId: userId };
    if (context) query.context = context;
    if (classId) query.classId = classId;
    if (lectureId) query.lectureId = lectureId;

    const threads = await ChatThread.find(query)
      .select('context classId lectureId title messages createdAt updatedAt')
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();

    const threadsWithPreview = threads.map(thread => ({
      _id: thread._id,
      context: thread.context,
      classId: thread.classId,
      lectureId: thread.lectureId,
      title: thread.title,
      messageCount: thread.messages?.length || 0,
      lastMessage: thread.messages?.length > 0 
        ? thread.messages[thread.messages.length - 1].content.substring(0, 100)
        : null,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt
    }));

    return res.status(200).json({
      success: true,
      threads: threadsWithPreview
    });

  } catch (error) {
    console.error('Get threads error:', error);
    return res.status(500).json({ 
      message: "Server error", 
      error: error.message 
    });
  }
};

/**
 * Get a specific thread with messages
 * GET /api/chat/threads/:threadId
 */
export const getThreadById = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { threadId } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const thread = await ChatThread.findOne({ 
      _id: threadId, 
      ownerId: userId 
    });

    if (!thread) {
      return res.status(404).json({ message: "Thread not found" });
    }

    return res.status(200).json({
      success: true,
      thread: {
        _id: thread._id,
        context: thread.context,
        classId: thread.classId,
        lectureId: thread.lectureId,
        title: thread.title,
        messages: thread.messages,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt
      }
    });

  } catch (error) {
    console.error('Get thread error:', error);
    return res.status(500).json({ 
      message: "Server error", 
      error: error.message 
    });
  }
};

/**
 * Send a message and get AI response
 * POST /api/chat/threads/:threadId/messages
 */
export const sendMessage = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { threadId } = req.params;
    const { message } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ message: "Message is required" });
    }

    // Find the thread
    const thread = await ChatThread.findOne({ 
      _id: threadId, 
      ownerId: userId 
    });

    if (!thread) {
      return res.status(404).json({ message: "Thread not found" });
    }

    // Fetch context-specific data
    let contextData;
    try {
      contextData = await fetchChatContext(
        thread.context,
        userId,
        thread.classId?.toString(),
        thread.lectureId?.toString()
      );
    } catch (contextError) {
      console.error('Context fetch error:', contextError);
      return res.status(400).json({ 
        message: "Failed to fetch context", 
        error: contextError.message 
      });
    }

    // Add user message to thread
    thread.messages.push({
      role: "user",
      content: message.trim(),
      citations: []
    });

    // Build conversation history for OpenAI Responses API (last 10 messages)
    const conversationHistory = thread.messages
      .slice(-10) // Keep last 10 messages for context
      .map(msg => ({
        role: msg.role, // 'user' or 'assistant'
        content: msg.content
      }));

    // Generate AI response using OpenAI Responses API (v1/responses)
    // Benefits: Stateful conversations, 40-80% better cache utilization, reduced latency
    // gpt-4o-mini: 128K context window, 16K max output
    try {
      const response = await responsesService.chat({
        message: message.trim(),
        systemPrompt: contextData.systemPrompt,
        conversationHistory,
        // Use thread's previous response ID for conversation continuity if available
        previousResponseId: thread.lastResponseId || null,
        temperature: 0.7,
        maxOutputTokens: 2000, // Increased for detailed responses (gpt-4o-mini supports up to 16K)
        userId,
        service: "chat"
      });

      const aiResponse = response.text || "I apologize, but I couldn't generate a response. Please try again.";

      // Add AI response to thread
      thread.messages.push({
        role: "assistant",
        content: aiResponse,
        citations: []
      });

      // Store the response ID for conversation continuity (Responses API feature)
      if (response.responseId) {
        thread.lastResponseId = response.responseId;
      }

      // Save thread
      await thread.save();

      return res.status(200).json({
        success: true,
        message: {
          role: "assistant",
          content: aiResponse,
          timestamp: new Date()
        },
        threadId: thread._id
      });

    } catch (aiError) {
      console.error('AI generation error:', aiError);
      
      // Still save the user message even if AI fails
      await thread.save();
      
      return res.status(500).json({ 
        message: "AI response generation failed", 
        error: aiError.message 
      });
    }

  } catch (error) {
    console.error('Send message error:', error);
    return res.status(500).json({ 
      message: "Server error", 
      error: error.message 
    });
  }
};

/**
 * Delete a thread
 * DELETE /api/chat/threads/:threadId
 */
export const deleteThread = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { threadId } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const thread = await ChatThread.findOneAndDelete({ 
      _id: threadId, 
      ownerId: userId 
    });

    if (!thread) {
      return res.status(404).json({ message: "Thread not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Thread deleted successfully"
    });

  } catch (error) {
    console.error('Delete thread error:', error);
    return res.status(500).json({ 
      message: "Server error", 
      error: error.message 
    });
  }
};

/**
 * Clear messages from a thread (keep thread, remove messages)
 * POST /api/chat/threads/:threadId/clear
 */
export const clearThread = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { threadId } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const thread = await ChatThread.findOne({ 
      _id: threadId, 
      ownerId: userId 
    });

    if (!thread) {
      return res.status(404).json({ message: "Thread not found" });
    }

    thread.messages = [];
    await thread.save();

    return res.status(200).json({
      success: true,
      message: "Thread cleared successfully"
    });

  } catch (error) {
    console.error('Clear thread error:', error);
    return res.status(500).json({ 
      message: "Server error", 
      error: error.message 
    });
  }
};

export default {
  createOrGetThread,
  getUserThreads,
  getThreadById,
  sendMessage,
  deleteThread,
  clearThread
};

