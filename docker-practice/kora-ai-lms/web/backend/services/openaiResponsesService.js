/**
 * OpenAI Responses API Service
 * ============================
 * 
 * Centralized service for OpenAI's v1/responses endpoint.
 * 
 * Benefits over Chat Completions API:
 * - Stateful conversations (automatic conversation tracking) - ONLY for KoraBot and Comprehension
 * - 40-80% better cache utilization (reduced latency and costs)
 * - Built-in tools support (file search, code interpreter, etc.)
 * - Multimodal support (text, images, audio, function calls)
 * - Better structured outputs with function calling
 * 
 * IMPORTANT: Notes, Study Guide, Quizzes, and Flashcards generation are STATELESS
 * and do NOT use any caching or previous response IDs.
 * 
 * @see https://platform.openai.com/docs/guides/responses-vs-chat-completions
 */

import OpenAI from "openai";
import { recordChatCompletionUsage } from "./usageService.js";

// Default model for all AI operations
const DEFAULT_MODEL = "gpt-4o-mini-2024-07-18";

// gpt-4o-mini token limits
const MAX_INPUT_TOKENS = 128000;  // 128K context window
const MAX_OUTPUT_TOKENS = 16384;  // 16K max output

// API timeout configuration (30 minutes for long operations)
const API_TIMEOUT_MS = 30 * 60 * 1000;

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 60000;

/**
 * OpenAI Responses API Service
 * Provides a unified interface for all AI operations using the Responses API
 */
class OpenAIResponsesService {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    this.model = options.model || DEFAULT_MODEL;
    this.timeout = options.timeout || API_TIMEOUT_MS;
    this.client = null;
    
    if (!this.apiKey) {
      throw new Error("OpenAI API key is required");
    }
  }

  /**
   * Get or initialize OpenAI client (lazy initialization)
   */
  getClient() {
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: this.apiKey,
        timeout: this.timeout,
        maxRetries: MAX_RETRIES
      });
    }
    return this.client;
  }

  /**
   * Sleep utility for retry delays
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a response using the Responses API
   * This is the main method for generating AI responses
   * 
   * @param {Object} options - Request options
   * @param {string} options.input - User input/message
   * @param {string} options.instructions - System instructions (like system prompt)
   * @param {string} [options.previousResponseId] - Previous response ID for conversation continuity
   * @param {Array} [options.tools] - Tools to use (functions, etc.)
   * @param {string} [options.toolChoice] - Tool choice preference ("auto", "required", "none")
   * @param {number} [options.temperature=0.7] - Temperature for response generation
   * @param {number} [options.maxOutputTokens=2000] - Maximum output tokens
   * @param {string} [options.userId] - User ID for usage tracking
   * @param {string} [options.service] - Service name for usage tracking
   * @returns {Promise<Object>} - Response object with text and metadata
   */
  async createResponse(options) {
    const {
      input,
      instructions,
      previousResponseId = null,
      tools = null,
      toolChoice = null,
      temperature = 0.7,
      maxOutputTokens = 2000,
      userId = null,
      service = "responses-api"
    } = options;

    const client = this.getClient();
    
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        // Build request payload
        const requestPayload = {
          model: this.model,
          input: input,
          temperature: temperature,
          max_output_tokens: maxOutputTokens
        };

        // Add instructions if provided
        if (instructions) {
          requestPayload.instructions = instructions;
        }

        // Add previous response ID for conversation continuity
        if (previousResponseId) {
          requestPayload.previous_response_id = previousResponseId;
        }

        // Add tools if provided
        if (tools && tools.length > 0) {
          requestPayload.tools = tools;
        }

        // Add tool choice if provided
        if (toolChoice) {
          requestPayload.tool_choice = toolChoice;
        }

        // Make the API call
        const response = await client.responses.create(requestPayload);

        // Extract the response text
        let responseText = "";
        let functionCallResults = [];

        if (response.output && Array.isArray(response.output)) {
          for (const output of response.output) {
            if (output.type === "message" && output.content) {
              for (const content of output.content) {
                if (content.type === "output_text" || content.type === "text") {
                  responseText += content.text || "";
                }
              }
            }
            if (output.type === "function_call") {
              functionCallResults.push({
                name: output.name,
                arguments: output.arguments ? JSON.parse(output.arguments) : null
              });
            }
          }
        }

        // Fallback to output_text if available
        if (!responseText && response.output_text) {
          responseText = response.output_text;
        }

        // Record usage for cost tracking
        const usage = response.usage || {};
        try {
          await recordChatCompletionUsage({
            userId,
            service,
            model: this.model,
            usage: {
              prompt_tokens: usage.input_tokens || 0,
              completion_tokens: usage.output_tokens || 0,
              total_tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0)
            }
          });
        } catch (logErr) {
          console.warn("[ResponsesAPI] Usage logging failed:", logErr?.message);
        }

        return {
          text: responseText.trim(),
          responseId: response.id,
          functionCalls: functionCallResults,
          usage: {
            inputTokens: usage.input_tokens || 0,
            outputTokens: usage.output_tokens || 0,
            totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0)
          },
          model: response.model || this.model
        };

      } catch (error) {
        console.error(`[ResponsesAPI] Error (attempt ${attempt + 1}):`, error.message);

        // Check if Responses API is not available, fall back gracefully
        if (
          error.message?.includes("not found") ||
          error.message?.includes("invalid_request") ||
          error.message?.includes("does not exist") ||
          error.status === 404
        ) {
          console.warn("[ResponsesAPI] Endpoint not available, falling back to Chat Completions");
          return await this.fallbackToChatCompletions(options);
        }

        // Rate limit handling
        if (error.message?.includes("rate limit") && attempt < MAX_RETRIES - 1) {
          const delay = Math.min(INITIAL_RETRY_DELAY * Math.pow(2, attempt), MAX_RETRY_DELAY);
          console.warn(`[ResponsesAPI] Rate limit hit, retrying in ${delay}ms`);
          await this.sleep(delay);
        } else if (attempt < MAX_RETRIES - 1) {
          await this.sleep(INITIAL_RETRY_DELAY);
        } else {
          // Final attempt failed
          console.warn("[ResponsesAPI] All attempts failed, falling back to Chat Completions");
          return await this.fallbackToChatCompletions(options);
        }
      }
    }

    // Fallback to Chat Completions if all retries failed
    return await this.fallbackToChatCompletions(options);
  }

  /**
   * Fallback to Chat Completions API
   * Used when Responses API is not available or fails
   */
  async fallbackToChatCompletions(options) {
    const {
      input,
      instructions,
      conversationHistory = [],
      temperature = 0.7,
      maxOutputTokens = 2000,
      userId = null,
      service = "chat-completions-fallback"
    } = options;

    const client = this.getClient();

    const messages = [];

    // Add system message
    if (instructions) {
      messages.push({ role: "system", content: instructions });
    }

    // Add conversation history
    if (conversationHistory.length > 0) {
      messages.push(...conversationHistory);
    }

    // Add current user input
    messages.push({ role: "user", content: input });

    const response = await client.chat.completions.create({
      model: this.model,
      messages,
      temperature,
      max_tokens: maxOutputTokens,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0
    });

    const responseText = response.choices[0]?.message?.content || "";

    // Record usage
    try {
      await recordChatCompletionUsage({
        userId,
        service,
        model: this.model,
        usage: response.usage
      });
    } catch (logErr) {
      console.warn("[ChatCompletions Fallback] Usage logging failed:", logErr?.message);
    }

    return {
      text: responseText.trim(),
      responseId: null, // Chat Completions doesn't have response IDs
      functionCalls: [],
      usage: {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0
      },
      model: response.model || this.model,
      fallback: true
    };
  }

  /**
   * Create a chat response with conversation history support
   * Optimized for chat applications with stateful conversations
   * 
   * @param {Object} options - Chat options
   * @param {string} options.message - Current user message
   * @param {string} options.systemPrompt - System instructions
   * @param {Array} options.conversationHistory - Previous messages [{role, content}]
   * @param {string} [options.previousResponseId] - Previous response ID for Responses API
   * @param {number} [options.temperature=0.7] - Temperature
   * @param {number} [options.maxOutputTokens=2000] - Max output tokens
   * @param {string} [options.userId] - User ID for tracking
   * @param {string} [options.service] - Service name for tracking
   */
  async chat(options) {
    const {
      message,
      systemPrompt,
      conversationHistory = [],
      previousResponseId = null,
      temperature = 0.7,
      maxOutputTokens = 2000,
      userId = null,
      service = "chat"
    } = options;

    // Build input with conversation context for Responses API
    // Responses API handles conversations differently - we can pass previous_response_id
    // or include history in the input
    let input = message;

    // If we have conversation history but no previousResponseId, include context in input
    if (conversationHistory.length > 0 && !previousResponseId) {
      // Format recent conversation for context
      const recentHistory = conversationHistory.slice(-10); // Last 10 messages
      const contextMessages = recentHistory
        .map(msg => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
        .join("\n\n");
      
      input = `Previous conversation:\n${contextMessages}\n\nCurrent message:\n${message}`;
    }

    return await this.createResponse({
      input,
      instructions: systemPrompt,
      previousResponseId,
      temperature,
      maxOutputTokens,
      userId,
      service,
      // Pass conversation history for fallback
      conversationHistory
    });
  }

  /**
   * Generate structured content (notes, quizzes, flashcards, etc.)
   * Uses function calling for guaranteed structured output
   * 
   * @param {Object} options - Generation options
   * @param {string} options.content - Source content to process
   * @param {string} options.instructions - Generation instructions
   * @param {Object} options.outputSchema - JSON schema for output
   * @param {string} [options.functionName] - Name of the extraction function
   * @param {number} [options.temperature=0.3] - Temperature (lower for more precise output)
   * @param {number} [options.maxOutputTokens=4000] - Max output tokens
   * @param {string} [options.userId] - User ID for tracking
   * @param {string} [options.service] - Service name for tracking
   */
  async generateStructured(options) {
    const {
      content,
      instructions,
      outputSchema,
      functionName = "extract_data",
      functionDescription = "Extract structured data from content",
      temperature = 0.3,
      maxOutputTokens = 4000,
      userId = null,
      service = "structured-generation"
    } = options;

    // Define the function tool
    const tools = [{
      type: "function",
      name: functionName,
      description: functionDescription,
      parameters: outputSchema
    }];

    const response = await this.createResponse({
      input: content,
      instructions,
      tools,
      toolChoice: "required", // Force function call
      temperature,
      maxOutputTokens,
      userId,
      service
    });

    // Extract structured data from function call
    if (response.functionCalls && response.functionCalls.length > 0) {
      const functionCall = response.functionCalls.find(fc => fc.name === functionName);
      if (functionCall) {
        return {
          data: functionCall.arguments,
          responseId: response.responseId,
          usage: response.usage
        };
      }
    }

    // If no function call, try to parse the text response as JSON
    try {
      const data = JSON.parse(response.text);
      return {
        data,
        responseId: response.responseId,
        usage: response.usage
      };
    } catch {
      // Return raw text if JSON parsing fails
      return {
        data: null,
        text: response.text,
        responseId: response.responseId,
        usage: response.usage
      };
    }
  }

  /**
   * Generate AI response for comprehension Q&A
   * Optimized for educational question answering
   */
  async generateComprehensionResponse(options) {
    const {
      question,
      context,
      isTextMode = false,
      userId = null
    } = options;

    return await this.createResponse({
      input: question,
      instructions: context.systemPrompt || context,
      temperature: 0.7,
      maxOutputTokens: isTextMode ? 2000 : 500, // Shorter for audio/TTS
      userId,
      service: "comprehension-qa"
    });
  }

  /**
   * Generate lecture notes from transcript
   * @param {string} transcript - Lecture transcript
   * @param {string} systemPrompt - Notes generation system prompt
   * @param {string} userId - User ID
   * 
   * ENHANCED for maximum depth, detail, and comprehensive coverage
   * Uses OpenAI Responses API (v1/responses) - STATELESS (no cache or previous state)
   * IMPORTANT: Does NOT include lecture title, class title, or syllabus references
   */
  async generateNotes(transcript, systemPrompt, userId = null) {
    // Detect content characteristics for adaptive prompting
    const wordCount = transcript.split(/\s+/).length;
    const hasEquations = /[=×÷±∑∫∂√π]|equation|formula|equals|squared|derivative|integral/i.test(transcript);
    const hasTechnicalContent = /theorem|principle|theory|hypothesis|coefficient|variable|constant|function|matrix|vector/i.test(transcript);
    
    const userPrompt = `Generate COMPREHENSIVE and DETAILED lecture notes for the following content.

IMPORTANT REQUIREMENTS:
1. This content contains approximately ${wordCount} words - your notes should be proportionally thorough
2. Extract and explain EVERY key concept, term, and idea discussed
3. Create detailed Main Explanation sections for EACH topic covered (aim for 8-15 sections)
4. Each section should have 5-8 bullet points with 2-4 sub-bullets each
5. Include ALL examples, analogies, and illustrations mentioned
${hasEquations ? "6. CRITICAL: This content contains equations/formulas - include ALL of them in plain text format\n7. Write equations clearly (e.g., \"F = ma\", \"E = mc²\", \"ds² = g_mn dx^m dx^n\")" : ""}
${hasTechnicalContent ? "8. This is technical content - preserve ALL technical terminology and complexity" : ""}
9. Do NOT simplify or abbreviate - capture the full depth of the content
10. The notes should be comprehensive enough for a student to fully understand the material

CONTENT:
${transcript}

Generate a complete, DETAILED Markdown document following all the structure requirements. Include:
- Comprehensive Overview (4-6 sentences)
- Complete Key Concepts list (10-15+ terms with detailed explanations)
- Thorough Main Explanations (8-15 sections with hierarchical bullets)
- Comparison Tables (if comparisons were made, using Markdown table syntax)
- All Equations/Formulas (if present, in plain text)
- Notable Quotes (3-5 significant quotes, using Markdown blockquote syntax)
- Implications/Takeaways (4-6 points)
- Student-Friendly Wrap-Up (4-6 bullets)

The output must be in Markdown format only (no HTML) with maximum depth and detail.`;

    // Use Responses API - STATELESS (no previousResponseId, no caching)
    const response = await this.createResponse({
      input: userPrompt,
      instructions: systemPrompt,
      previousResponseId: null, // STATELESS - no previous context
      temperature: 0.3,
      maxOutputTokens: MAX_OUTPUT_TOKENS, // Use maximum output tokens (16K)
      userId,
      service: "notes-generation-kora"
    });

    let markdownContent = response.text || "";
    
    // Remove markdown code block markers if present (in case GPT wraps it)
    markdownContent = markdownContent.replace(/^```markdown\s*/i, "").replace(/^```\s*/, "").replace(/\s*```\s*$/, "");

    return {
      markdown: markdownContent,
      html: markdownContent, // Keep html field for backward compatibility during transition
      responseId: null, // Not storing responseId for stateless operations
      usage: response.usage
    };
  }

  /**
   * Generate study guide from transcript
   * ENHANCED for maximum depth, detail, and exam-focused comprehensiveness
   * Uses OpenAI Responses API (v1/responses) - STATELESS (no cache or previous state)
   * IMPORTANT: Does NOT include lecture title, class title, or syllabus references
   */
  async generateStudyGuide(transcript, systemPrompt, userId = null) {
    // Detect content characteristics for adaptive prompting
    const wordCount = transcript.split(/\s+/).length;
    const hasEquations = /[=×÷±∑∫∂√π]|equation|formula|equals|squared|derivative|integral/i.test(transcript);
    const hasTechnicalContent = /theorem|principle|theory|hypothesis|coefficient|variable|constant|function|matrix|vector/i.test(transcript);
    
    const userPrompt = `Generate a COMPREHENSIVE, DETAILED, exam-focused study guide for the following content.

IMPORTANT REQUIREMENTS:
1. This content contains approximately ${wordCount} words - create a proportionally thorough study guide
2. Extract ALL testable concepts, definitions, and key terms (aim for 10-15+ terms)
3. Create detailed Core Ideas sections for EVERY major topic (aim for 8-15 sections)
4. Each Core Ideas section should have 5-8 bullet points with sub-bullets for details
5. Include ALL examples, distinctions, and explanations
${hasEquations ? "6. CRITICAL: This content contains equations/formulas - include ALL of them in the Equations section\n7. Write equations in plain text (e.g., \"F = ma\", \"z' = z - (1/2)gt²\")" : ""}
${hasTechnicalContent ? "8. This is technical content - preserve ALL technical terminology and complexity" : ""}
9. Generate comprehensive Assessment Questions (12+ questions across all types)
10. The study guide should enable complete exam preparation for this material

CONTENT:
${transcript}

Generate a complete, DETAILED HTML document following all Kora brand requirements. Include ALL of these sections:
- Comprehensive Overview (3-5 sentences covering themes and objectives)
- Complete Key Terms Table (10-15+ terms with detailed exam-focused definitions)
- Thorough Core Ideas & Explanations (8-15 sections with hierarchical bullets)
- Comparison Tables (if any comparisons were made)
- All Equations & Relationships (if present, in plain text)
- Common Mistakes & Misconceptions (if mentioned)
- Comprehensive Assessment Questions:
  * 5-7 Recall questions
  * 5-7 Application questions
  * 3-4 Critical Thinking questions
- Self-Quiz (8-12 questions covering all topics)
- Ten Things to Remember (high-yield takeaways)

The output must be a full, valid HTML document with maximum depth and detail for complete exam preparation.`;

    // Use Responses API - STATELESS (no previousResponseId, no caching)
    const response = await this.createResponse({
      input: userPrompt,
      instructions: systemPrompt,
      previousResponseId: null, // STATELESS - no previous context
      temperature: 0.3,
      maxOutputTokens: MAX_OUTPUT_TOKENS, // Use maximum output tokens (16K)
      userId,
      service: "study-guide-generation-kora"
    });

    let htmlContent = response.text || "";
    htmlContent = htmlContent.replace(/^```html\s*/i, "").replace(/^```\s*/, "").replace(/\s*```\s*$/, "");

    return {
      html: htmlContent,
      responseId: null, // Not storing responseId for stateless operations
      usage: response.usage
    };
  }

  /**
   * Generate quiz questions from notes
   * ENHANCED: Strict content-scoped generation with content isolation
   * Uses OpenAI Responses API (v1/responses) - STATELESS (no cache or previous state)
   * IMPORTANT: Does NOT include lecture title, class title, or syllabus references
   */
  async generateQuizQuestions(content, sectionTitle, count, bloomLevel, bloomInfo, difficulty, systemPrompt, userId = null) {
    // Create unique identifier for tracking (NOT for caching)
    const uniqueId = `quiz-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    const prompt = `=== QUIZ GENERATION ===
Topic: "${sectionTitle}"
Generation ID: ${uniqueId}

Generate EXACTLY ${count} Multiple Choice questions ONLY from the content provided below.

=== STRICT CONTENT ISOLATION ===
- ONLY use information from the content below
- DO NOT add any external knowledge, facts, or information from other sources
- Every question must be answerable using ONLY the provided content
- If a concept is not in the content, DO NOT include it in questions

**Requirements:**
- Question Type: Multiple Choice (4 options each)
- Bloom's Taxonomy Level: ${bloomLevel} (Level ${bloomInfo.level}) - ${bloomInfo.description}
- Difficulty: ${difficulty}
- Use action verbs: ${bloomInfo.verbs.join(", ")}

=== CONTENT (USE ONLY THIS) ===
${content}
=== END OF CONTENT ===

**Response Format (JSON):**
{
  "questions": [
    {
      "question_text": "Clear, well-formed question based ONLY on the above content",
      "question_type": "multiple_choice",
      "difficulty": "${difficulty}",
      "bloom_level": "${bloomLevel}",
      "options": ["First answer choice", "Second answer choice", "Third answer choice", "Fourth answer choice"],
      "correct_answer": "First answer choice",
      "hint": "Helpful hint referencing concepts from the content",
      "explanation": "Explanation using only information from the content"
    }
  ]
}

IMPORTANT: 
- Do NOT include A., B., C., D. or any letter/number prefixes in the options
- All questions MUST be derived from the content above - no external knowledge`;

    // Use structured generation with JSON output - STATELESS
    const outputSchema = {
      type: "object",
      properties: {
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              question_text: { type: "string" },
              question_type: { type: "string" },
              difficulty: { type: "string" },
              bloom_level: { type: "string" },
              options: { type: "array", items: { type: "string" } },
              correct_answer: { type: "string" },
              hint: { type: "string" },
              explanation: { type: "string" }
            },
            required: ["question_text", "options", "correct_answer"]
          }
        }
      },
      required: ["questions"]
    };

    const result = await this.generateStructured({
      content: prompt,
      instructions: systemPrompt,
      outputSchema,
      functionName: "generate_quiz_questions",
      functionDescription: "Generate quiz questions from content",
      temperature: 0.7,
      maxOutputTokens: 4000, // Increased for more comprehensive quiz generation
      userId,
      service: "quiz-generation"
    });

    return result.data?.questions || [];
  }

  /**
   * Generate flashcards from notes
   * ENHANCED: Strict content-scoped generation with content isolation
   * Uses OpenAI Responses API (v1/responses) - STATELESS (no cache or previous state)
   * IMPORTANT: Does NOT include lecture title, class title, or syllabus references
   */
  async generateFlashcards(content, sectionTitle, cardType, typeInfo, count, systemPrompt, userId = null) {
    // Create unique identifier for tracking (NOT for caching)
    const uniqueId = `flashcard-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    const prompt = `=== FLASHCARD GENERATION ===
Topic: "${sectionTitle}"
Generation ID: ${uniqueId}

Generate EXACTLY ${count} ${typeInfo.name} flashcards ONLY from the content provided below.

=== STRICT CONTENT ISOLATION ===
- ONLY use information from the content below
- DO NOT add any external knowledge, facts, or information from other sources
- Every flashcard must test concepts from ONLY the provided content
- If a term or concept is not in the content, DO NOT include it

=== BREVITY REQUIREMENTS - MANDATORY ===
CRITICAL: Flashcards must be SHORT and CONCISE for quick memorization.
- Front: 1-2 sentences MAX (10-20 words). Use a question or brief prompt.
- Back: 2-3 sentences MAX (15-30 words). Give the essential answer only.
- NO paragraphs, NO lengthy explanations, NO verbose text
- Extract ONE core concept per flashcard
- Distill long content to the essential point
- Mnemonic: Keep to 5-10 words if included
- Hint: Keep to 5-10 words if included
- Example: Keep to 1 brief sentence if included

**Requirements:**
- Card Type: ${typeInfo.name} - ${typeInfo.description}
- Structure: ${typeInfo.structure}
- Topic: ${sectionTitle}

=== CONTENT (USE ONLY THIS) ===
${content}
=== END OF CONTENT ===

**Response Format (JSON):**
{
  "flashcards": [
    {
      "card_type": "${cardType}",
      "front": "Brief question or prompt (10-20 words max)",
      "back": "Concise answer (15-30 words max)",
      "mnemonic": "Short memory aid (5-10 words, optional)",
      "example": "Brief example (1 sentence, optional)",
      "hint": "Short study hint (5-10 words)",
      "difficulty": "easy|medium|hard",
      "category": "${sectionTitle}",
      "tags": ["${sectionTitle}"]
    }
  ]
}

IMPORTANT: 
- All flashcards MUST be derived from the content above - no external knowledge.
- Keep ALL fields SHORT and CONCISE - flashcards are for quick review, not detailed study.`;

    const outputSchema = {
      type: "object",
      properties: {
        flashcards: {
          type: "array",
          items: {
            type: "object",
            properties: {
              card_type: { type: "string" },
              front: { type: "string" },
              back: { type: "string" },
              mnemonic: { type: "string" },
              example: { type: "string" },
              hint: { type: "string" },
              difficulty: { type: "string" },
              category: { type: "string" },
              tags: { type: "array", items: { type: "string" } }
            },
            required: ["front", "back"]
          }
        }
      },
      required: ["flashcards"]
    };

    // Use structured generation - STATELESS
    const result = await this.generateStructured({
      content: prompt,
      instructions: systemPrompt,
      outputSchema,
      functionName: "generate_flashcards",
      functionDescription: "Generate flashcards from content",
      temperature: 0.5,
      maxOutputTokens: 3000, // Increased for more comprehensive flashcard generation
      userId,
      service: "flashcards-generation"
    });

    return result.data?.flashcards || [];
  }
}

/**
 * Create a singleton instance of the service
 */
let serviceInstance = null;

/**
 * Get or create the OpenAI Responses Service instance
 * @param {Object} options - Service options
 * @returns {OpenAIResponsesService}
 */
export function getResponsesService(options = {}) {
  if (!serviceInstance) {
    serviceInstance = new OpenAIResponsesService(options);
  }
  return serviceInstance;
}

/**
 * Create a new instance of the service (for cases where separate instances are needed)
 * @param {Object} options - Service options
 * @returns {OpenAIResponsesService}
 */
export function createResponsesService(options = {}) {
  return new OpenAIResponsesService(options);
}

export { OpenAIResponsesService };
export default OpenAIResponsesService;
