/**
 * Enhanced Syllabus Parser
 * =========================
 *
 * Production-ready syllabus parser that replaces Python script
 * with JavaScript OpenAI API integration. Implements the same strategies
 * as the Python script but uses OpenAI's API directly.
 *
 * Features:
 * - Multi-format file support (PDF, DOCX, Images via OCR)
 * - OpenAI GPT integration for intelligent parsing
 * - Comprehensive event extraction with date parsing
 * - ISO 8601 datetime conversion
 * - Event type classification and reminder generation
 * - Retry logic with exponential backoff
 * - Progress tracking and error handling
 * - Structured JSON output matching Python format
 *
 * Author: AI Assistant
 * Version: 1.0.0
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import https from "https";
import http from "http";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = path.join(__dirname, "..", "temp");

// ============================================================================
// CONFIGURATION AND CONSTANTS
// ============================================================================

const DEFAULT_MODEL = "gpt-4o-mini-2024-07-18";
// gpt-4o-mini-2024-07-18 supports 128k context window - utilize full power
const MAX_TOKENS_PER_REQUEST = 128000; // Full context window
const TOKEN_BUFFER = 2000; // Buffer for response and safety
const MAX_INPUT_TOKENS = MAX_TOKENS_PER_REQUEST - TOKEN_BUFFER; // ~126k tokens for input

// Cost tracking (as of 2024)
const COST_PER_1K_TOKENS = {
  "gpt-4o-mini-2024-07-18": { input: 0.00015, output: 0.000075 },
};

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 60000; // 60 seconds

// Timeout configuration
const OPENAI_API_TIMEOUT_MS = parseInt(process.env.SYLLABUS_OPENAI_TIMEOUT_MS) || 30 * 60 * 1000; // 30 minutes for OpenAI API
const FILE_EXTRACTION_TIMEOUT_MS = parseInt(process.env.SYLLABUS_EXTRACTION_TIMEOUT_MS) || 5 * 60 * 1000; // 5 minutes for text extraction

// File size limits (in MB)
const MAX_FILE_SIZE_MB = 50;
const MAX_IMAGE_SIZE_MB = 15; // Increased to support high-quality scanned syllabuses

// Supported file types
const SUPPORTED_EXTENSIONS = {
  ".pdf": "PDF Document",
  ".docx": "Word Document",
  ".doc": "Word Document (Legacy)",
  ".png": "PNG Image",
  ".jpg": "JPEG Image",
  ".jpeg": "JPEG Image",
  ".tiff": "TIFF Image",
  ".bmp": "Bitmap Image",
};

// ============================================================================
// GPT-4O-MINI STRUCTURED OUTPUTS - JSON SCHEMA
// ============================================================================

/**
 * Strict JSON Schema for GPT-4o-mini Structured Outputs
 * This ensures guaranteed valid JSON responses matching our exact format
 */
const SYLLABUS_JSON_SCHEMA = {
  name: "syllabus_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      className: {
        type: "string",
        description: "Full course name (e.g., 'Introduction to Computer Science')"
      },
      term: {
        type: "string",
        description: "Term in format: fall-YYYY, spring-YYYY, summer-YYYY, or winter-YYYY"
      },
      meetingDays: {
        type: "array",
        items: {
          type: "string",
          enum: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        },
        description: "Class meeting days as 3-letter abbreviations"
      },
      startTime: {
        type: "string",
        description: "Class start time in 24-hour format HH:MM (e.g., '14:00')"
      },
      endTime: {
        type: "string",
        description: "Class end time in 24-hour format HH:MM (e.g., '15:30')"
      },
      instructor: {
        type: "string",
        description: "Instructor's full name"
      },
      events: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Descriptive title of the event"
            },
            start: {
              type: "string",
              description: "Start datetime in ISO 8601 format (YYYY-MM-DDTHH:MM:SS.000Z)"
            },
            end: {
              type: "string",
              description: "End datetime in ISO 8601 format (YYYY-MM-DDTHH:MM:SS.000Z)"
            },
            type: {
              type: "string",
              enum: ["assignment", "quiz", "exam", "midterm", "final", "project", "presentation", "lab", "reading", "study"],
              description: "Type of event"
            },
            location: {
              type: "string",
              description: "Location or submission method"
            },
            reminders: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  minutesBefore: {
                    type: "number",
                    description: "Minutes before event to send reminder"
                  }
                },
                required: ["minutesBefore"],
                additionalProperties: false
              },
              description: "Reminder settings"
            }
          },
          required: ["title", "start", "end", "type", "location", "reminders"],
          additionalProperties: false
        },
        description: "All course events extracted from syllabus"
      }
    },
    required: ["className", "term", "meetingDays", "startTime", "endTime", "instructor", "events"],
    additionalProperties: false
  }
};

// ============================================================================
// GPT-4O-MINI FUNCTION CALLING DEFINITIONS
// ============================================================================

/**
 * Function definitions for multi-step syllabus extraction
 * Uses GPT-4o-mini's function calling for reliable structured data extraction
 */
const EXTRACTION_FUNCTIONS = {
  // Function 1: Extract basic course information
  extractCourseInfo: {
    name: "extract_course_info",
    description: "Extract basic course information from syllabus text including class name, term, instructor, and meeting schedule",
    parameters: {
      type: "object",
      properties: {
        className: {
          type: "string",
          description: "Full course name (e.g., 'CS 101: Introduction to Computer Science')"
        },
        term: {
          type: "string",
          description: "Academic term in format 'fall-2025', 'spring-2025', 'summer-2025', or 'winter-2025'"
        },
        instructor: {
          type: "string",
          description: "Instructor's name (without titles like Dr., Prof.)"
        },
        meetingDays: {
          type: "array",
          items: {
            type: "string",
            enum: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
          },
          description: "Days the class meets"
        },
        startTime: {
          type: "string",
          description: "Class start time in 24-hour format (HH:MM)"
        },
        endTime: {
          type: "string",
          description: "Class end time in 24-hour format (HH:MM)"
        },
        location: {
          type: "string",
          description: "Primary classroom location"
        },
        officeHours: {
          type: "string",
          description: "Instructor's office hours if mentioned"
        }
      },
      required: ["className", "term", "instructor", "meetingDays", "startTime", "endTime"]
    }
  },

  // Function 2: Parse a date string into ISO format
  parseDate: {
    name: "parse_date",
    description: "Parse a date string from various formats into ISO 8601 format. Use this for each date found in the syllabus.",
    parameters: {
      type: "object",
      properties: {
        originalText: {
          type: "string",
          description: "The original date text from syllabus (e.g., 'Sept 15', 'Week 3', '9/15/2025')"
        },
        parsedDate: {
          type: "string",
          description: "Parsed date in ISO 8601 format (YYYY-MM-DDTHH:MM:SS.000Z)"
        },
        confidence: {
          type: "string",
          enum: ["high", "medium", "low"],
          description: "Confidence level in the date parsing"
        },
        assumptions: {
          type: "string",
          description: "Any assumptions made during parsing (e.g., 'Assumed year 2025', 'Assumed end of day')"
        }
      },
      required: ["originalText", "parsedDate", "confidence"]
    }
  },

  // Function 3: Extract a single event
  extractEvent: {
    name: "extract_event",
    description: "Extract a single course event (assignment, exam, quiz, project, etc.) with all its details",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Descriptive event title (e.g., 'Assignment 1: Variables and Data Types')"
        },
        type: {
          type: "string",
          enum: ["assignment", "quiz", "exam", "midterm", "final", "project", "presentation", "lab", "reading", "study"],
          description: "Event type category"
        },
        startDateTime: {
          type: "string",
          description: "Event start in ISO 8601 format (YYYY-MM-DDTHH:MM:SS.000Z)"
        },
        endDateTime: {
          type: "string",
          description: "Event end in ISO 8601 format (YYYY-MM-DDTHH:MM:SS.000Z)"
        },
        location: {
          type: "string",
          description: "Where to submit or attend (e.g., 'Canvas', 'Room 203', 'Online')"
        },
        description: {
          type: "string",
          description: "Additional details about the event"
        },
        weight: {
          type: "string",
          description: "Grade weight if mentioned (e.g., '10%', '50 points')"
        }
      },
      required: ["title", "type", "startDateTime", "endDateTime", "location"]
    }
  },

  // Function 4: Extract all events at once (for comprehensive extraction)
  extractAllEvents: {
    name: "extract_all_events",
    description: "Extract ALL course events from the syllabus at once. Call this after extracting course info.",
    parameters: {
      type: "object",
      properties: {
        events: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description: "Descriptive event title"
              },
              type: {
                type: "string",
                enum: ["assignment", "quiz", "exam", "midterm", "final", "project", "presentation", "lab", "reading", "study"]
              },
              startDateTime: {
                type: "string",
                description: "ISO 8601 datetime"
              },
              endDateTime: {
                type: "string",
                description: "ISO 8601 datetime"
              },
              location: {
                type: "string"
              },
              weight: {
                type: "string",
                description: "Grade weight if mentioned"
              }
            },
            required: ["title", "type", "startDateTime", "endDateTime", "location"]
          },
          description: "Array of all events found in syllabus"
        },
        totalEventsFound: {
          type: "number",
          description: "Total count of events extracted"
        },
        extractionNotes: {
          type: "string",
          description: "Any notes about the extraction process or assumptions made"
        }
      },
      required: ["events", "totalEventsFound"]
    }
  },

  // Function 5: Validate and finalize the extraction
  finalizeExtraction: {
    name: "finalize_extraction",
    description: "Validate and finalize the complete syllabus extraction with all course info and events",
    parameters: {
      type: "object",
      properties: {
        isComplete: {
          type: "boolean",
          description: "Whether all information has been successfully extracted"
        },
        courseInfo: {
          type: "object",
          properties: {
            className: { type: "string" },
            term: { type: "string" },
            instructor: { type: "string" },
            meetingDays: { type: "array", items: { type: "string" } },
            startTime: { type: "string" },
            endTime: { type: "string" }
          },
          required: ["className", "term", "instructor", "meetingDays", "startTime", "endTime"]
        },
        events: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              start: { type: "string" },
              end: { type: "string" },
              type: { type: "string" },
              location: { type: "string" },
              reminders: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    minutesBefore: { type: "number" }
                  }
                }
              }
            },
            required: ["title", "start", "end", "type", "location", "reminders"]
          }
        },
        validationErrors: {
          type: "array",
          items: { type: "string" },
          description: "Any validation errors or missing information"
        },
        suggestions: {
          type: "array",
          items: { type: "string" },
          description: "Suggestions for improving the extraction"
        }
      },
      required: ["isComplete", "courseInfo", "events"]
    }
  }
};

// Parsing mode options
const PARSING_MODE = {
  STRUCTURED_OUTPUT: 'structured_output',  // Chat Completions with JSON schema
  FUNCTION_CALLING: 'function_calling',    // Chat Completions with function calls
  HYBRID: 'hybrid',                        // Best of structured + function calling
  RESPONSES_API: 'responses_api'           // v1/responses API (recommended for production)
};

// ============================================================================
// GPT-4O-MINI RESPONSES API TOOLS DEFINITION
// ============================================================================

/**
 * Tools for the Responses API
 * These are used with v1/responses endpoint for advanced extraction
 */
/**
 * Tools for the Responses API (v1/responses)
 * Note: Responses API uses a FLAT structure where 'name' is at the top level
 * This is different from Chat Completions API which nests under 'function'
 */
const RESPONSES_API_TOOLS = [
  {
    type: "function",
    name: "extract_syllabus_data",
    description: "Extract complete syllabus data including course information and all events",
    parameters: {
      type: "object",
      properties: {
        className: {
          type: "string",
          description: "Full course name"
        },
        term: {
          type: "string",
          description: "Academic term (fall-YYYY, spring-YYYY, summer-YYYY, winter-YYYY)"
        },
        instructor: {
          type: "string",
          description: "Instructor's name"
        },
        meetingDays: {
          type: "array",
          items: { type: "string", enum: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
          description: "Days the class meets"
        },
        startTime: {
          type: "string",
          description: "Class start time in 24-hour format (HH:MM)"
        },
        endTime: {
          type: "string",
          description: "Class end time in 24-hour format (HH:MM)"
        },
        events: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              type: { type: "string", enum: ["assignment", "quiz", "exam", "midterm", "final", "project", "presentation", "lab", "reading", "study"] },
              start: { type: "string", description: "ISO 8601 datetime" },
              end: { type: "string", description: "ISO 8601 datetime" },
              location: { type: "string" }
            },
            required: ["title", "type", "start", "end", "location"]
          },
          description: "All course events (assignments, exams, quizzes, projects, etc.)"
        }
      },
      required: ["className", "term", "instructor", "meetingDays", "startTime", "endTime", "events"]
    }
  }
];

// ============================================================================
// DATA CLASSES AND CONFIGURATION
// ============================================================================

/**
 * Configuration for syllabus parsing
 */
export class ParserConfig {
  constructor(options = {}) {
    // OpenAI settings
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    this.model = options.model || DEFAULT_MODEL;
    this.temperature = options.temperature || 0.1; // Lower for more precise extraction
    this.maxTokens = options.maxTokens || 16000; // Maximum output tokens for comprehensive extraction

    // Event extraction
    this.inferDates = options.inferDates !== false;
    this.currentYear = options.currentYear || new Date().getFullYear();
    this.semesterStart = options.semesterStart || null;

    // File processing
    this.maxFileSizeMB = options.maxFileSizeMB || MAX_FILE_SIZE_MB;
    this.ocrEnabled = options.ocrEnabled !== false;
    this.ocrLanguage = options.ocrLanguage || "eng";

    // Advanced options
    this.customInstructions = options.customInstructions || null;
    this.timezone = options.timezone || "America/New_York";
    
    // User tracking
    this.userId = options.userId || null;

    // GPT-4o-mini Feature Selection
    // Options: 'structured_output', 'function_calling', 'hybrid', 'responses_api'
    // - structured_output: Chat Completions with JSON schema (faster, simpler)
    // - function_calling: Chat Completions with function calls (better for complex syllabuses)
    // - hybrid: Tries structured output first, falls back to function calling
    // - responses_api: Uses v1/responses API (RECOMMENDED - most advanced features)
    this.parsingMode = options.parsingMode || PARSING_MODE.RESPONSES_API;
  }
}

/**
 * Event reminder configuration
 */
export class EventReminder {
  constructor(minutesBefore) {
    this.minutesBefore = minutesBefore;
  }

  toDict() {
    return { minutesBefore: this.minutesBefore };
  }
}

/**
 * Course event representation
 */
export class CourseEvent {
  constructor(data) {
    this.title = data.title;
    this.start = data.start; // ISO datetime string
    this.end = data.end; // ISO datetime string
    this.type = data.type; // event type: assignment, quiz, exam, study, etc.
    this.className = data.className; // class/course name
    this.location = data.location || null;
    this.reminders = data.reminders || [
      new EventReminder(30),
      new EventReminder(5),
    ];
  }

  toDict() {
    return {
      title: this.title,
      start: this.start,
      end: this.end,
      type: this.type,
      class: this.className,
      location: this.location,
      reminders: this.reminders.map((r) => r.toDict()),
    };
  }
}

/**
 * Complete syllabus parsing result
 */
export class SyllabusResult {
  constructor(data) {
    this.className = data.className;
    this.term = data.term; // e.g., "fall-2025"
    this.meetingDays = data.meetingDays; // e.g., ["Mon", "Tue", "Wed"]
    this.startTime = data.startTime; // e.g., "10:00"
    this.endTime = data.endTime; // e.g., "11:15"
    this.instructor = data.instructor;
    this.events = data.events || [];

    // Processing metrics
    this.totalTokensUsed = data.totalTokensUsed || 0;
    this.totalCost = data.totalCost || 0.0;
    this.processingTime = data.processingTime || 0.0;
  }

  toDict() {
    return {
      className: this.className,
      term: this.term,
      meetingDays: this.meetingDays,
      startTime: this.startTime,
      endTime: this.endTime,
      instructor: this.instructor,
      events: this.events.map((event) => event.toDict()),
    };
  }
}

// ============================================================================
// FILE PROCESSING
// ============================================================================

/**
 * Handle file upload and text extraction
 */
export class FileProcessor {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Validate file exists and is supported
   */
  async validateFile(fileBuffer, originalFilename) {
    if (!fileBuffer || fileBuffer.length === 0) {
      return { valid: false, message: "File is empty" };
    }

    const fileExt = path.extname(originalFilename).toLowerCase();
    if (!SUPPORTED_EXTENSIONS[fileExt]) {
      return {
        valid: false,
        message: `Unsupported file type: ${fileExt}. Supported: ${Object.keys(
          SUPPORTED_EXTENSIONS
        ).join(", ")}`,
      };
    }

    // Check file size
    const fileSizeMB = fileBuffer.length / (1024 * 1024);
    const maxSize = [".png", ".jpg", ".jpeg", ".tiff", ".bmp"].includes(fileExt)
      ? MAX_IMAGE_SIZE_MB
      : this.config.maxFileSizeMB;

    if (fileSizeMB > maxSize) {
      return {
        valid: false,
        message: `File too large: ${fileSizeMB.toFixed(
          2
        )}MB (max: ${maxSize}MB)`,
      };
    }

    return { valid: true, message: "OK" };
  }

  /**
   * Get file information
   */
  getFileInfo(fileBuffer, originalFilename) {
    const fileExt = path.extname(originalFilename).toLowerCase();
    const sizeBytes = fileBuffer.length;

    return {
      filename: originalFilename,
      fileType: SUPPORTED_EXTENSIONS[fileExt] || "Unknown",
      extension: fileExt,
      sizeBytes: sizeBytes,
      sizeMB: sizeBytes / (1024 * 1024),
      sizeHuman: this.formatSize(sizeBytes),
      modified: new Date().toISOString(),
      mimeType: this.getMimeType(fileExt),
    };
  }

  /**
   * Format file size in human-readable format
   */
  formatSize(sizeBytes) {
    const units = ["B", "KB", "MB", "GB"];
    let size = sizeBytes;

    for (const unit of units) {
      if (size < 1024.0) {
        return `${size.toFixed(2)} ${unit}`;
      }
      size /= 1024.0;
    }
    return `${size.toFixed(2)} TB`;
  }

  /**
   * Get MIME type for file extension
   */
  getMimeType(extension) {
    const mimeTypes = {
      ".pdf": "application/pdf",
      ".docx":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".doc": "application/msword",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".tiff": "image/tiff",
      ".bmp": "image/bmp",
    };
    return mimeTypes[extension] || "application/octet-stream";
  }

  /**
   * Extract text from file based on type
   * Supports PDF, DOCX, DOC, and image files (PNG, JPG, JPEG, TIFF, BMP)
   * Uses production-ready libraries: pdf-parse, mammoth.js, and Tesseract.js
   */
  async extractText(fileBuffer, originalFilename) {
    const fileExt = path.extname(originalFilename).toLowerCase();

    this.logger.info(`Extracting text from ${fileExt} file...`);

    // For now, we'll use a placeholder implementation
    // In production, you would integrate with:
    // - PDF.js or pdf-parse for PDF files
    // - mammoth.js for DOCX files
    // - Tesseract.js for OCR

    if (fileExt === ".pdf") {
      return await this.extractPdfText(fileBuffer);
    } else if (fileExt === ".docx") {
      return await this.extractDocxText(fileBuffer);
    } else if (fileExt === ".doc") {
      return await this.extractDocText(fileBuffer);
    } else if ([".png", ".jpg", ".jpeg", ".tiff", ".bmp"].includes(fileExt)) {
      return await this.extractImageText(fileBuffer, originalFilename);
    } else {
      throw new Error(`Unsupported file type: ${fileExt}`);
    }
  }

  /**
   * Extract text from PDF using pdf-parse
   */
  async extractPdfText(fileBuffer) {
    try {
      const { PDFParse } = require("pdf-parse");
      
      this.logger.info("Extracting text from PDF file...");
      
      // Create parser instance with buffer
      const parser = new PDFParse({ data: fileBuffer });
      
      // Extract text using getText() method
      const result = await parser.getText();
      
      // Clean up resources
      await parser.destroy();
      
      if (!result.text || result.text.trim().length === 0) {
        throw new Error(
          "No text could be extracted from the PDF. The file might be image-based or corrupted."
        );
      }
      
      this.logger.info(
        `PDF text extraction completed. Extracted ${result.text.length} characters from ${result.numpages} pages.`
      );
      
      return result.text;
    } catch (error) {
      this.logger.error(`PDF text extraction failed: ${error.message}`);
      // Provide more specific error messages
      if (error.message.includes("Invalid PDF")) {
        throw new Error(
          "Invalid PDF file format. Please ensure the file is a valid PDF document."
        );
      } else if (error.message.includes("password")) {
        throw new Error(
          "Password-protected PDF files are not supported. Please provide an unprotected PDF."
        );
      } else if (error.message.includes("corrupted")) {
        throw new Error(
          "The PDF file appears to be corrupted. Please try a different file."
        );
      } else {
        throw new Error(`PDF text extraction failed: ${error.message}`);
      }
    }
  }

  /**
   * Extract text from DOCX using mammoth.js
   */
  async extractDocxText(fileBuffer) {
    try {
      const mammoth = (await import("mammoth")).default;

      this.logger.info("Extracting text from DOCX file...");

      // Convert buffer to ArrayBuffer for mammoth
      const arrayBuffer = fileBuffer.buffer.slice(
        fileBuffer.byteOffset,
        fileBuffer.byteOffset + fileBuffer.byteLength
      );

      const result = await mammoth.extractRawText({ buffer: arrayBuffer });

      if (!result.value || result.value.trim().length === 0) {
        throw new Error(
          "No text could be extracted from the DOCX file. The file might be empty or corrupted."
        );
      }

      // Log warnings if any were encountered during extraction
      if (result.messages && result.messages.length > 0) {
        const warnings = result.messages.filter(
          (msg) => msg.type === "warning"
        );
        if (warnings.length > 0) {
          this.logger.warning(
            `DOCX extraction warnings: ${warnings
              .map((w) => w.message)
              .join(", ")}`
          );
        }
      }

      this.logger.info(
        `DOCX text extraction completed. Extracted ${result.value.length} characters.`
      );

      return result.value;
    } catch (error) {
      this.logger.error(`DOCX text extraction failed: ${error.message}`);

      // Provide more specific error messages
      if (error.message.includes("Invalid DOCX")) {
        throw new Error(
          "Invalid DOCX file format. Please ensure the file is a valid Word document."
        );
      } else if (error.message.includes("corrupted")) {
        throw new Error(
          "The DOCX file appears to be corrupted. Please try a different file."
        );
      } else {
        throw new Error(`DOCX text extraction failed: ${error.message}`);
      }
    }
  }

  /**
   * Extract text from legacy DOC files
   * Note: .doc files are more complex and may require additional libraries
   */
  async extractDocText(fileBuffer) {
    try {
      this.logger.info("Extracting text from legacy DOC file...");

      // For legacy .doc files, we'll try to use mammoth as a fallback
      // though it's primarily designed for .docx files
      const mammoth = (await import("mammoth")).default;

      // Convert buffer to ArrayBuffer for mammoth
      const arrayBuffer = fileBuffer.buffer.slice(
        fileBuffer.byteOffset,
        fileBuffer.byteOffset + fileBuffer.byteLength
      );

      try {
        const result = await mammoth.extractRawText({ buffer: arrayBuffer });

        if (result.value && result.value.trim().length > 0) {
          this.logger.info(
            `DOC text extraction completed. Extracted ${result.value.length} characters.`
          );
          return result.value;
        }
      } catch (mammothError) {
        this.logger.warning(
          `Mammoth failed to parse DOC file: ${mammothError.message}`
        );
      }

      // If mammoth fails, provide a helpful error message
      throw new Error(
        "Legacy DOC files are not fully supported. Please convert your document to DOCX or PDF format for better compatibility."
      );
    } catch (error) {
      this.logger.error(`DOC text extraction failed: ${error.message}`);

      if (error.message.includes("not fully supported")) {
        throw error; // Re-throw our custom error message
      } else {
        throw new Error(
          `DOC text extraction failed: ${error.message}. Consider converting to DOCX or PDF format.`
        );
      }
    }
  }

  /**
   * Extract text from image using Tesseract.js OCR
   */
  async extractImageText(fileBuffer, originalFilename = "image") {
    try {
      const Tesseract = (await import("tesseract.js")).default;

      this.logger.info("Starting OCR text extraction from image...");

      // Get proper MIME type based on file extension
      const fileExt = path.extname(originalFilename).toLowerCase();
      const mimeType = this.getMimeType(fileExt);

      // Convert buffer to base64 for Tesseract
      const base64Image = `data:${mimeType};base64,${fileBuffer.toString(
        "base64"
      )}`;

      // Configure Tesseract for better accuracy
      const options = {
        logger: (m) => {
          if (m.status === "recognizing text") {
            this.logger.info(`OCR Progress: ${Math.round(m.progress * 100)}%`);
          }
        },
        // OCR configuration for better text recognition
        tessedit_pageseg_mode: Tesseract.PSM.AUTO, // Automatic page segmentation
        tessedit_ocr_engine_mode: Tesseract.OEM.LSTM_ONLY, // Use LSTM OCR engine
        preserve_interword_spaces: "1", // Preserve spaces between words
        tessedit_char_whitelist: "", // Allow all characters (can be customized)
      };

      this.logger.info("Running OCR on image...");

      const {
        data: { text, confidence },
      } = await Tesseract.recognize(
        base64Image,
        this.config.ocrLanguage || "eng", // Language code
        options
      );

      if (!text || text.trim().length === 0) {
        throw new Error(
          "No text could be extracted from the image. The image might not contain readable text."
        );
      }

      // Log confidence level
      this.logger.info(
        `OCR completed with ${confidence.toFixed(1)}% confidence. Extracted ${
          text.length
        } characters.`
      );

      // Warn if confidence is low
      if (confidence < 60) {
        this.logger.warning(
          `Low OCR confidence (${confidence.toFixed(
            1
          )}%). Results may be inaccurate.`
        );
      }

      return text;
    } catch (error) {
      this.logger.error(`OCR text extraction failed: ${error.message}`);

      // Provide more specific error messages
      if (error.message.includes("Invalid image")) {
        throw new Error(
          "Invalid image format. Please ensure the image is in a supported format (PNG, JPG, JPEG, TIFF, BMP)."
        );
      } else if (error.message.includes("corrupted")) {
        throw new Error(
          "The image file appears to be corrupted. Please try a different file."
        );
      } else if (error.message.includes("memory")) {
        throw new Error(
          "Insufficient memory for OCR processing. Please try with a smaller image file."
        );
      } else {
        throw new Error(`OCR text extraction failed: ${error.message}`);
      }
    }
  }
}

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

/**
 * Manage token counting and cost calculation
 */
export class TokenManager {
  constructor(model = DEFAULT_MODEL) {
    this.model = model;
  }

  /**
   * Count tokens in text (simple approximation)
   */
  countTokens(text) {
    // Simple approximation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate API cost
   */
  calculateCost(inputTokens, outputTokens, model) {
    const costs =
      COST_PER_1K_TOKENS[model] || COST_PER_1K_TOKENS[DEFAULT_MODEL];
    const inputCost = (inputTokens / 1000) * costs.input;
    const outputCost = (outputTokens / 1000) * costs.output;
    return inputCost + outputCost;
  }
}

// ============================================================================
// OPENAI API HANDLER
// ============================================================================

/**
 * Handle OpenAI API calls for syllabus parsing
 * Supports three parsing modes:
 * 1. STRUCTURED_OUTPUT: Uses GPT-4o-mini's JSON schema validation for guaranteed valid output
 * 2. FUNCTION_CALLING: Multi-step extraction using function calls for complex syllabuses
 * 3. HYBRID: Combines both for best results (default)
 */
export class OpenAIHandler {
  constructor(apiKey, model, config, logger, userId = null) {
    this.apiKey = apiKey;
    this.model = model;
    this.config = config;
    this.logger = logger;
    this.tokenManager = new TokenManager(model);
    this.userId = userId;
    this.client = null; // Lazy initialization
    
    // Default to hybrid mode for best results
    this.parsingMode = config.parsingMode || PARSING_MODE.HYBRID;
  }

  /**
   * Initialize OpenAI client (lazy)
   */
  async getClient() {
    if (!this.client) {
      const OpenAI = (await import("openai")).default;
      this.client = new OpenAI({ 
        apiKey: this.apiKey,
        timeout: OPENAI_API_TIMEOUT_MS, // 30 minutes - match transcription service
        maxRetries: MAX_RETRIES // Explicit retry configuration
      });
    }
    return this.client;
  }

  /**
   * Parse complete syllabus data - main entry point
   * Automatically selects best parsing method based on configuration
   */
  async parseSyllabusComplete(text, semesterStart = null) {
    this.logger.info(`Parsing mode: ${this.parsingMode}`);
    
    switch (this.parsingMode) {
      case PARSING_MODE.RESPONSES_API:
        return await this.parseWithResponsesAPI(text, semesterStart);
      case PARSING_MODE.STRUCTURED_OUTPUT:
        return await this.parseWithStructuredOutput(text, semesterStart);
      case PARSING_MODE.FUNCTION_CALLING:
        return await this.parseWithFunctionCalling(text, semesterStart);
      case PARSING_MODE.HYBRID:
      default:
        return await this.parseHybrid(text, semesterStart);
    }
  }

  // ============================================================================
  // METHOD 0: RESPONSES API (v1/responses) - RECOMMENDED
  // ============================================================================

  /**
   * Parse syllabus using OpenAI's Responses API (v1/responses)
   * This is the most advanced method with:
   * - Stateful conversations
   * - Built-in tools support
   * - Better structured outputs
   * - Function calling
   * 
   * @param {string} text - Syllabus text content
   * @param {Date} semesterStart - Optional semester start date
   * @returns {Object} - Parsed syllabus data with token counts
   */
  async parseWithResponsesAPI(text, semesterStart = null) {
    const inputTokens = this.tokenManager.countTokens(text);
    const currentYear = semesterStart?.getFullYear() || new Date().getFullYear();
    
    // Truncate text if needed (Responses API also has token limits)
    const maxChars = 400000;
    const textToUse = text.length > maxChars ? text.slice(0, maxChars) : text;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        this.logger.info(`[Responses API] Parsing syllabus (attempt ${attempt + 1})`);
        
        const client = await this.getClient();
        
        // Use the Responses API (v1/responses)
        const response = await client.responses.create({
          model: this.model,
          
          // Instructions act as system prompt
          instructions: this.getResponsesAPIInstructions(currentYear),
          
          // Input is the syllabus content
          input: this.buildResponsesAPIInput(textToUse, semesterStart),
          
          // Define tools for structured extraction
          tools: RESPONSES_API_TOOLS,
          
          // Force the model to use our extraction function
          // Responses API uses "required" to force tool calling
          tool_choice: "required",
          
          // Additional parameters
          temperature: this.config.temperature,
          max_output_tokens: this.config.maxTokens
        });

        // Record usage
        const usage = response.usage || { input_tokens: inputTokens, output_tokens: 0 };
        await this.recordUsage({
          prompt_tokens: usage.input_tokens || inputTokens,
          completion_tokens: usage.output_tokens || 0,
          total_tokens: (usage.input_tokens || inputTokens) + (usage.output_tokens || 0)
        }, 'responses-api');

        // Extract data from response
        let syllabusData = null;

        // Check for tool calls first
        if (response.output && Array.isArray(response.output)) {
          for (const output of response.output) {
            if (output.type === 'function_call' && output.name === 'extract_syllabus_data') {
              syllabusData = JSON.parse(output.arguments);
              break;
            }
            if (output.type === 'message' && output.content) {
              // Try to parse from message content
              for (const content of output.content) {
                if (content.type === 'text') {
                  try {
                    syllabusData = JSON.parse(content.text);
                    break;
                  } catch (e) {
                    // Continue looking
                  }
                }
              }
            }
          }
        }

        // Fallback: Check output_text if available
        if (!syllabusData && response.output_text) {
          try {
            syllabusData = JSON.parse(response.output_text);
          } catch (e) {
            this.logger.warning(`[Responses API] Could not parse output_text: ${e.message}`);
          }
        }

        if (syllabusData) {
          // Format events with reminders
          if (syllabusData.events) {
            syllabusData.events = syllabusData.events.map(event => ({
              ...event,
              reminders: event.reminders || [{ minutesBefore: 30 }, { minutesBefore: 5 }]
            }));
          }

          this.logger.info(`[Responses API] Successfully extracted ${syllabusData.events?.length || 0} events`);
          
          return {
            syllabusData,
            inputTokens: usage.input_tokens || inputTokens,
            outputTokens: usage.output_tokens || 0,
            responseId: response.id // Store for potential follow-up requests
          };
        }

        throw new Error('No valid syllabus data extracted from response');

      } catch (error) {
        this.logger.error(`[Responses API] Error: ${error.message}`);
        
        // Check if Responses API is not available, fall back to Chat Completions
        if (error.message.includes('not found') || 
            error.message.includes('invalid_request') ||
            error.message.includes('does not exist') ||
            error.status === 404) {
          this.logger.warning(`[Responses API] Endpoint not available, falling back to structured output`);
          return await this.parseWithStructuredOutput(text, semesterStart);
        }
        
        if (error.message.includes("rate limit") && attempt < MAX_RETRIES - 1) {
          const delay = Math.min(INITIAL_RETRY_DELAY * Math.pow(2, attempt), MAX_RETRY_DELAY);
          this.logger.warning(`Rate limit hit, retrying in ${delay}ms`);
          await this.sleep(delay);
        } else if (attempt < MAX_RETRIES - 1) {
          this.logger.warning(`Retrying due to error...`);
          await this.sleep(INITIAL_RETRY_DELAY);
        } else {
          // Final attempt failed, fall back to structured output
          this.logger.warning(`[Responses API] All attempts failed, falling back to structured output`);
          return await this.parseWithStructuredOutput(text, semesterStart);
        }
      }
    }

    // Fallback to structured output
    return await this.parseWithStructuredOutput(text, semesterStart);
  }

  /**
   * Get instructions for Responses API (acts as system prompt)
   */
  getResponsesAPIInstructions(currentYear) {
    return `You are an expert academic syllabus parser. Your task is to extract ALL information from course syllabuses with perfect accuracy.

CRITICAL REQUIREMENTS:
1. Extract the complete course name, term, instructor, and meeting schedule
2. Extract EVERY single event mentioned (assignments, quizzes, exams, projects, labs, readings, presentations)
3. Parse ALL dates into ISO 8601 format (YYYY-MM-DDTHH:MM:SS.000Z)
4. Convert all times to 24-hour format (e.g., "14:00" not "2:00 PM")
5. Use 3-letter day abbreviations: Mon, Tue, Wed, Thu, Fri, Sat, Sun
6. Include location for each event

CURRENT YEAR: ${currentYear}

EVENT TYPES (use exactly these values):
- assignment: Homework, essays, papers, problem sets
- quiz: Short tests, pop quizzes
- exam: General exams
- midterm: Midterm examination
- final: Final examination
- project: Course projects, group work
- presentation: Student presentations
- lab: Lab sessions, lab reports
- reading: Required readings
- study: Study sessions, review sessions

DATE HANDLING RULES:
- For dates without time: use 23:59:00 for due dates (end of day)
- For morning events without time: use 09:00:00
- For afternoon events without time: use 14:00:00
- Estimate reasonable end times based on event type

IMPORTANT: Call the extract_syllabus_data function with ALL extracted information. Do not skip any events or deadlines!`;
  }

  /**
   * Build input for Responses API
   */
  buildResponsesAPIInput(text, semesterStart = null) {
    let semesterInfo = "";
    if (semesterStart) {
      semesterInfo = `\n\nSemester Start Date: ${semesterStart.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric"
      })}`;
    }

    return `Please extract ALL course information and events from the following syllabus. Be comprehensive and extract every deadline, assignment, quiz, exam, and project mentioned.${semesterInfo}

=== SYLLABUS CONTENT ===
${text}
=== END OF SYLLABUS ===

Extract all information and call the extract_syllabus_data function with the complete data.`;
  }

  // ============================================================================
  // METHOD 1: STRUCTURED OUTPUT (JSON SCHEMA)
  // ============================================================================

  /**
   * Parse syllabus using GPT-4o-mini's Structured Outputs feature
   * This guarantees valid JSON matching our exact schema - no parsing errors!
   */
  async parseWithStructuredOutput(text, semesterStart = null) {
    const prompt = this.buildStructuredPrompt(text, semesterStart);
    const inputTokens = this.tokenManager.countTokens(prompt);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        this.logger.info(`[Structured Output] Parsing syllabus (attempt ${attempt + 1})`);
        
        const client = await this.getClient();
        const response = await client.chat.completions.create({
          model: this.model,
          messages: [
            { role: "system", content: this.getStructuredSystemPrompt() },
            { role: "user", content: prompt }
          ],
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens,
          // Use JSON Schema for strict validation
          response_format: {
            type: "json_schema",
            json_schema: SYLLABUS_JSON_SCHEMA
          }
        });

        // Record usage
        await this.recordUsage(response.usage, 'structured-output');
        
        const outputTokens = response.usage.completion_tokens;
        
        // With structured outputs, JSON is guaranteed valid!
        const syllabusData = JSON.parse(response.choices[0].message.content);
        
        this.logger.info(`[Structured Output] Successfully extracted ${syllabusData.events?.length || 0} events`);
        
        return { syllabusData, inputTokens, outputTokens };
        
      } catch (error) {
        this.logger.error(`[Structured Output] Error: ${error.message}`);
        
        if (error.message.includes("rate limit") && attempt < MAX_RETRIES - 1) {
          const delay = Math.min(INITIAL_RETRY_DELAY * Math.pow(2, attempt), MAX_RETRY_DELAY);
          this.logger.warning(`Rate limit hit, retrying in ${delay}ms`);
          await this.sleep(delay);
        } else if (attempt < MAX_RETRIES - 1) {
          this.logger.warning(`Retrying due to error...`);
          await this.sleep(INITIAL_RETRY_DELAY);
        } else {
          throw error;
        }
      }
    }

    return { syllabusData: {}, inputTokens, outputTokens: 0 };
  }

  /**
   * Get system prompt optimized for structured outputs
   */
  getStructuredSystemPrompt() {
    return `You are an expert academic syllabus parser. Your task is to extract ALL information from the syllabus into a structured format.

CRITICAL REQUIREMENTS:
1. Extract the complete course name, term, instructor, and meeting schedule
2. Extract EVERY single event (assignments, quizzes, exams, projects, labs, readings, presentations)
3. Parse ALL dates accurately into ISO 8601 format (YYYY-MM-DDTHH:MM:SS.000Z)
4. Convert times to 24-hour format (e.g., "14:00" not "2:00 PM")
5. Use 3-letter day abbreviations: Mon, Tue, Wed, Thu, Fri, Sat, Sun
6. Include location for events (where to submit/attend)
7. Always include reminders: [{"minutesBefore": 30}, {"minutesBefore": 5}]

EVENT TYPES (use exactly these values):
- assignment: Homework, essays, papers, problem sets
- quiz: Short tests, pop quizzes
- exam: General exams
- midterm: Midterm examination
- final: Final examination
- project: Course projects, group work
- presentation: Student presentations
- lab: Lab sessions, lab reports
- reading: Required readings
- study: Study sessions, review sessions

DATE HANDLING:
- If only date given (no time), use 23:59:00 for due dates
- If morning event without time, use 09:00:00
- If afternoon event without time, use 14:00:00
- Estimate reasonable end times (1-3 hours for assignments, exam duration for exams)

BE COMPREHENSIVE - Extract every deadline and event mentioned in the syllabus!`;
  }

  /**
   * Build prompt optimized for structured outputs
   */
  buildStructuredPrompt(text, semesterStart = null) {
    let startDateInfo = "";
    let currentYear = new Date().getFullYear();

    if (semesterStart) {
      startDateInfo = `\n\nSEMESTER START DATE: ${semesterStart.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric"
      })}`;
      currentYear = semesterStart.getFullYear();
    }

    const maxChars = 400000;
    const textToUse = text.length > maxChars ? text.slice(0, maxChars) : text;

    return `Extract ALL course information and events from this syllabus.
Current year for date parsing: ${currentYear}${startDateInfo}

=== SYLLABUS TEXT ===
${textToUse}
=== END SYLLABUS ===

Extract every single event, deadline, assignment, quiz, exam, and project mentioned above.
Ensure all dates are in ISO 8601 format with UTC timezone.`;
  }

  // ============================================================================
  // METHOD 2: FUNCTION CALLING (MULTI-STEP EXTRACTION)
  // ============================================================================

  /**
   * Parse syllabus using function calling for complex multi-step extraction
   * Better for syllabuses with complex structures or many events
   */
  async parseWithFunctionCalling(text, semesterStart = null) {
    const inputTokens = this.tokenManager.countTokens(text);
    let totalOutputTokens = 0;
    
    try {
      this.logger.info(`[Function Calling] Starting multi-step extraction`);
      const client = await this.getClient();

      // Step 1: Extract course information
      this.logger.info(`[Function Calling] Step 1: Extracting course info`);
      const courseInfo = await this.extractCourseInfoWithFunction(client, text, semesterStart);
      totalOutputTokens += courseInfo.outputTokens;

      // Step 2: Extract all events
      this.logger.info(`[Function Calling] Step 2: Extracting all events`);
      const eventsResult = await this.extractEventsWithFunction(client, text, courseInfo.data, semesterStart);
      totalOutputTokens += eventsResult.outputTokens;

      // Combine results
      const syllabusData = {
        className: courseInfo.data.className || "Unknown Course",
        term: courseInfo.data.term || `fall-${new Date().getFullYear()}`,
        meetingDays: courseInfo.data.meetingDays || [],
        startTime: courseInfo.data.startTime || "09:00",
        endTime: courseInfo.data.endTime || "10:30",
        instructor: courseInfo.data.instructor || "Unknown",
        events: eventsResult.events.map(event => ({
          title: event.title,
          start: event.startDateTime,
          end: event.endDateTime,
          type: event.type,
          location: event.location || "TBD",
          reminders: [{ minutesBefore: 30 }, { minutesBefore: 5 }]
        }))
      };

      this.logger.info(`[Function Calling] Extracted ${syllabusData.events.length} events`);

      return { syllabusData, inputTokens, outputTokens: totalOutputTokens };

    } catch (error) {
      this.logger.error(`[Function Calling] Error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract course information using function calling
   */
  async extractCourseInfoWithFunction(client, text, semesterStart) {
    const currentYear = semesterStart?.getFullYear() || new Date().getFullYear();
    
    const response = await client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "system",
          content: `You are a syllabus parser. Extract the basic course information. Current year: ${currentYear}`
        },
        {
          role: "user",
          content: `Extract course information from this syllabus:\n\n${text.slice(0, 50000)}`
        }
      ],
      tools: [{
        type: "function",
        function: EXTRACTION_FUNCTIONS.extractCourseInfo
      }],
      tool_choice: { type: "function", function: { name: "extract_course_info" } },
      temperature: 0.1,
      max_tokens: 2000
    });

    await this.recordUsage(response.usage, 'function-calling-courseinfo');

    const toolCall = response.choices[0].message.tool_calls?.[0];
    if (toolCall && toolCall.function.name === "extract_course_info") {
      return {
        data: JSON.parse(toolCall.function.arguments),
        outputTokens: response.usage.completion_tokens
      };
    }

    throw new Error("Failed to extract course info via function calling");
  }

  /**
   * Extract all events using function calling
   */
  async extractEventsWithFunction(client, text, courseInfo, semesterStart) {
    const currentYear = semesterStart?.getFullYear() || new Date().getFullYear();
    
    const response = await client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "system",
          content: `You are a syllabus parser. Extract ALL events (assignments, quizzes, exams, projects, labs, presentations, readings).
Current year: ${currentYear}
Course: ${courseInfo.className}
Term: ${courseInfo.term}

IMPORTANT: Parse ALL dates to ISO 8601 format (YYYY-MM-DDTHH:MM:SS.000Z).
For dates without time: use 23:59:00 for due dates, 09:00:00 for morning events, 14:00:00 for afternoon.
Estimate reasonable end times based on event type.`
        },
        {
          role: "user",
          content: `Extract ALL events from this syllabus. Be comprehensive - don't miss any deadlines!\n\n${text}`
        }
      ],
      tools: [{
        type: "function",
        function: EXTRACTION_FUNCTIONS.extractAllEvents
      }],
      tool_choice: { type: "function", function: { name: "extract_all_events" } },
      temperature: 0.1,
      max_tokens: 12000
    });

    await this.recordUsage(response.usage, 'function-calling-events');

    const toolCall = response.choices[0].message.tool_calls?.[0];
    if (toolCall && toolCall.function.name === "extract_all_events") {
      const result = JSON.parse(toolCall.function.arguments);
      this.logger.info(`[Function Calling] Found ${result.totalEventsFound} events`);
      return {
        events: result.events || [],
        outputTokens: response.usage.completion_tokens
      };
    }

    throw new Error("Failed to extract events via function calling");
  }

  // ============================================================================
  // METHOD 3: HYBRID (BEST OF BOTH)
  // ============================================================================

  /**
   * Hybrid approach: Use function calling for extraction, structured output for validation
   * This provides the best balance of accuracy and reliability
   */
  async parseHybrid(text, semesterStart = null) {
    const inputTokens = this.tokenManager.countTokens(text);
    
    try {
      this.logger.info(`[Hybrid] Starting hybrid extraction`);
      
      // Step 1: Try Responses API first (most advanced, recommended)
      try {
        this.logger.info(`[Hybrid] Attempting Responses API...`);
        const responsesResult = await this.parseWithResponsesAPI(text, semesterStart);
        
        if (responsesResult.syllabusData.events?.length > 0) {
          this.logger.info(`[Hybrid] Responses API successful with ${responsesResult.syllabusData.events.length} events`);
          return responsesResult;
        }
        
        this.logger.warning(`[Hybrid] Responses API returned no events, trying structured output`);
      } catch (responsesError) {
        this.logger.warning(`[Hybrid] Responses API not available: ${responsesError.message}, trying structured output`);
      }
      
      // Step 2: Try structured output (faster, guaranteed valid JSON)
      try {
        const structuredResult = await this.parseWithStructuredOutput(text, semesterStart);
        
        // If we got good results, use them
        if (structuredResult.syllabusData.events?.length > 0) {
          this.logger.info(`[Hybrid] Structured output successful with ${structuredResult.syllabusData.events.length} events`);
          return structuredResult;
        }
        
        this.logger.warning(`[Hybrid] Structured output returned no events, falling back to function calling`);
      } catch (structuredError) {
        this.logger.warning(`[Hybrid] Structured output failed: ${structuredError.message}, trying function calling`);
      }
      
      // Step 3: Fall back to function calling for complex syllabuses
      const functionResult = await this.parseWithFunctionCalling(text, semesterStart);
      
      // Validate function calling results with a quick structured output validation
      if (functionResult.syllabusData.events?.length > 0) {
        this.logger.info(`[Hybrid] Function calling successful with ${functionResult.syllabusData.events.length} events`);
        
        // Optional: Validate with structured output schema
        const validatedData = this.validateAgainstSchema(functionResult.syllabusData);
        return { 
          syllabusData: validatedData, 
          inputTokens, 
          outputTokens: functionResult.outputTokens 
        };
      }
      
      return functionResult;
      
    } catch (error) {
      this.logger.error(`[Hybrid] All methods failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate data against schema (local validation)
   */
  validateAgainstSchema(data) {
    // Ensure all required fields exist
    const validated = {
      className: data.className || "Unknown Course",
      term: data.term || `fall-${new Date().getFullYear()}`,
      meetingDays: Array.isArray(data.meetingDays) ? data.meetingDays.filter(d => 
        ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].includes(d)
      ) : [],
      startTime: this.validateTime(data.startTime) || "09:00",
      endTime: this.validateTime(data.endTime) || "10:30",
      instructor: data.instructor || "Unknown",
      events: []
    };

    // Validate events
    const validTypes = ["assignment", "quiz", "exam", "midterm", "final", "project", "presentation", "lab", "reading", "study"];
    
    for (const event of (data.events || [])) {
      if (event.title && (event.start || event.startDateTime)) {
        validated.events.push({
          title: String(event.title),
          start: event.start || event.startDateTime,
          end: event.end || event.endDateTime || event.start || event.startDateTime,
          type: validTypes.includes(event.type) ? event.type : "assignment",
          location: event.location || "TBD",
          reminders: event.reminders || [{ minutesBefore: 30 }, { minutesBefore: 5 }]
        });
      }
    }

    return validated;
  }

  /**
   * Validate time format (HH:MM)
   */
  validateTime(time) {
    if (!time) return null;
    const match = String(time).match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (match) {
      return `${match[1].padStart(2, '0')}:${match[2]}`;
    }
    return null;
  }

  // ============================================================================
  // LEGACY SUPPORT (Original method for backward compatibility)
  // ============================================================================

  /**
   * Call OpenAI API (legacy method - still supported)
   */
  async callOpenAI(prompt) {
    const client = await this.getClient();
    const response = await client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: this.getSystemPrompt() },
        { role: "user", content: prompt },
      ],
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
      response_format: { type: "json_object" },
    });
    await this.recordUsage(response.usage, 'legacy');
    return response;
  }

  /**
   * Get system prompt for syllabus parsing (legacy)
   */
  getSystemPrompt() {
    let prompt = `You are an expert academic syllabus parser with access to the FULL syllabus content. Extract ALL information comprehensively in a structured JSON format.

**Key Responsibilities:**
- Extract class name, term, instructor, and ALL course details
- Extract meeting days and times (in 24-hour format HH:MM)
- Identify and parse EVERY single course event (assignments, exams, quizzes, projects, labs, readings, presentations, etc.)
- Parse ALL dates accurately and convert to ISO 8601 datetime format
- For each event, estimate a reasonable duration (typically 1-3 hours for assignments/study, actual exam time for exams)
- Extract ALL deadlines, due dates, exam dates, quiz dates, project milestones
- Capture recurring events and weekly schedules

**Quality Standards:**
- Be COMPREHENSIVE - extract EVERY event and deadline mentioned
- Be precise and factual - only extract information explicitly stated
- Parse dates in ALL formats (MM/DD/YYYY, Month DD, Week X, Day of Week, etc.) and convert to ISO 8601
- Convert meeting days to 3-letter abbreviations (Mon, Tue, Wed, Thu, Fri, Sat, Sun)
- Convert ALL times to 24-hour format (e.g., "14:00" not "2:00 PM")
- For events, include location if available
- Add default reminders (30 minutes and 5 minutes before)
- Handle multi-week schedules, semester-long calendars, and detailed course timelines

**Important Notes:**
- You have access to the COMPLETE syllabus text - read EVERYTHING carefully
- Do NOT skip any sections - process the entire document
- Extract EVERY assignment, quiz, exam, project, lab, reading, and deadline
- Be thorough and exhaustive in your extraction

CRITICAL: Always respond with valid JSON format matching the exact structure requested.`;

    if (this.config.customInstructions) {
      prompt += `\n\nAdditional Instructions:\n${this.config.customInstructions}`;
    }

    return prompt;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Record API usage for cost tracking
   */
  async recordUsage(usage, method) {
    try {
      const { recordChatCompletionUsage } = await import('./usageService.js');
      await recordChatCompletionUsage({ 
        userId: this.userId, 
        service: `syllabus-parse-${method}`, 
        model: this.model, 
        usage 
      });
    } catch (err) {
      this.logger.warning(`Failed to record usage: ${err.message}`);
    }
  }

  /**
   * Sleep utility for retry delays
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// SYLLABUS PARSER ENGINE
// ============================================================================

/**
 * Main syllabus parsing engine
 */
export class SyllabusParser {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;

    if (!this.config.apiKey) {
      throw new Error("OpenAI API key is required");
    }

    this.fileProcessor = new FileProcessor(config, logger);
    this.openaiHandler = new OpenAIHandler(
      this.config.apiKey,
      this.config.model,
      this.config,
      logger,
      this.config.userId || null
    );
    this.tokenManager = new TokenManager(this.config.model);
  }

  /**
   * Parse syllabus from file buffer
   */
  async parse(fileBuffer, originalFilename) {
    const parsingStartTime = Date.now();

    // Define processing stages
    const stages = [
      "File Validation",
      "Text Extraction",
      "Syllabus Parsing",
      "Output Generation",
    ];

    this.logger.info(`Starting syllabus parsing: ${originalFilename}`);

    // Stage 1: Validate file
    this.logger.info("Stage 1: File Validation");
    const validation = await this.fileProcessor.validateFile(
      fileBuffer,
      originalFilename
    );
    if (!validation.valid) {
      throw new Error(`File validation failed: ${validation.message}`);
    }

    const fileInfo = this.fileProcessor.getFileInfo(
      fileBuffer,
      originalFilename
    );
    this.logger.info(
      `File: ${fileInfo.filename} (${fileInfo.sizeHuman}) - ${fileInfo.fileType}`
    );

    // Stage 2: Extract text
    this.logger.info("Stage 2: Text Extraction");
    let syllabusText;
    try {
      syllabusText = await this.fileProcessor.extractText(
        fileBuffer,
        originalFilename
      );
    } catch (error) {
      this.logger.error(`Text extraction failed: ${error.message}`);
      throw error;
    }

    if (!syllabusText || syllabusText.trim().length < 100) {
      throw new Error(
        "Extracted text is too short or empty. Please check the file."
      );
    }

    this.logger.info(
      `Extracted ${syllabusText.length.toLocaleString()} characters from syllabus (~${Math.ceil(syllabusText.length / 4).toLocaleString()} tokens)`
    );
    
    // Log syllabus size classification
    const estimatedTokens = Math.ceil(syllabusText.length / 4);
    if (estimatedTokens > 100000) {
      this.logger.warning(
        `Exceptionally large syllabus (${estimatedTokens.toLocaleString()} tokens). May exceed context window.`
      );
    } else if (estimatedTokens > 50000) {
      this.logger.info(
        `Large syllabus (${estimatedTokens.toLocaleString()} tokens). Full context processing enabled.`
      );
    } else {
      this.logger.info(
        `Standard syllabus size (${estimatedTokens.toLocaleString()} tokens). Optimal for processing.`
      );
    }

    // Determine semester start date
    let semesterStart = this.config.semesterStart;
    if (!semesterStart) {
      semesterStart = this.inferSemesterStartFromText(syllabusText);
    }

    // Stage 3: Parse complete syllabus
    this.logger.info("Stage 3: Syllabus Parsing");
    const { syllabusData, inputTokens, outputTokens } =
      await this.openaiHandler.parseSyllabusComplete(
        syllabusText,
        semesterStart
      );

    const cost = this.tokenManager.calculateCost(
      inputTokens,
      outputTokens,
      this.config.model
    );

    // Stage 4: Create result object
    this.logger.info("Stage 4: Output Generation");

    // Extract basic fields with defaults
    const className = syllabusData.className || "Unknown Course";
    const term = syllabusData.term || `fall-${new Date().getFullYear()}`;
    const meetingDays = syllabusData.meetingDays || [];
    const meetingStartTime = syllabusData.startTime || "09:00";
    const meetingEndTime = syllabusData.endTime || "10:30";
    const instructor = syllabusData.instructor || "Unknown";

    // Process events
    const events = [];
    for (const eventData of syllabusData.events || []) {
      const event = this.createEventObject(eventData, className);
      if (event) {
        events.push(event);
      }
    }

    this.logger.info(`Extracted ${events.length} events from syllabus`);

    const processingTime = (Date.now() - parsingStartTime) / 1000;

    const result = new SyllabusResult({
      className,
      term,
      meetingDays,
      startTime: meetingStartTime,
      endTime: meetingEndTime,
      instructor,
      events,
      totalTokensUsed: inputTokens + outputTokens,
      totalCost: cost,
      processingTime,
    });

    this.logger.info(`Parsing completed in ${processingTime.toFixed(2)}s`);
    this.logger.info(`Cost: $${cost.toFixed(4)}`);
    this.logger.info(`Course: ${className}`);
    this.logger.info(`Instructor: ${instructor}`);
    this.logger.info(`Events: ${events.length}`);

    return result;
  }

  /**
   * Create CourseEvent object from parsed data
   */
  createEventObject(data, className) {
    try {
      const title = data.title || "Untitled Event";
      const start = data.start;
      const end = data.end;
      const eventType = data.type || "assignment";
      const location = data.location || "TBD";

      // Validate required fields
      if (!start || !end) {
        this.logger.warning(
          `Skipping event '${title}' - missing start or end time`
        );
        return null;
      }

      // Process reminders
      const remindersData = data.reminders || [];
      const reminders = remindersData.map(
        (r) => new EventReminder(r.minutesBefore || 30)
      );

      // Use default reminders if none provided
      if (reminders.length === 0) {
        reminders.push(new EventReminder(30), new EventReminder(5));
      }

      return new CourseEvent({
        title,
        start,
        end,
        type: eventType,
        className,
        location,
        reminders,
      });
    } catch (error) {
      this.logger.warning(`Failed to create event object: ${error.message}`);
      return null;
    }
  }

  /**
   * Infer semester start date from syllabus text
   */
  inferSemesterStartFromText(text) {
    const currentYear = new Date().getFullYear();
    const textLower = text.toLowerCase();

    // Try to find year mentions
    const yearMatch = text.match(/20\d{2}/);
    if (yearMatch) {
      const foundYear = parseInt(yearMatch[0]);
      if (foundYear >= 2020 && foundYear <= 2030) {
        // Infer semester
        if (textLower.includes("fall") || textLower.includes("autumn")) {
          return new Date(foundYear, 8, 1); // September 1
        } else if (textLower.includes("spring")) {
          return new Date(foundYear, 0, 15); // January 15
        } else if (textLower.includes("summer")) {
          return new Date(foundYear, 5, 1); // June 1
        } else if (textLower.includes("winter")) {
          return new Date(foundYear, 0, 5); // January 5
        }
      }
    }

    return null;
  }
}

// ============================================================================
// MAIN EXPORT FUNCTION
// ============================================================================

/**
 * Parse syllabus from file buffer (main entry point)
 * 
 * @param {Buffer} fileBuffer - File content as buffer
 * @param {string} originalFilename - Original filename with extension
 * @param {Object} options - Parsing options
 * @param {string} options.parsingMode - Parsing mode: 'responses_api' | 'structured_output' | 'function_calling' | 'hybrid'
 * @param {string} options.userId - User ID for usage tracking
 * @param {Date} options.semesterStart - Semester start date for date parsing
 * @returns {Promise<SyllabusResult>} - Parsed syllabus data
 * 
 * @example
 * // Using Responses API (recommended)
 * const result = await parseSyllabus(buffer, 'syllabus.pdf', {
 *   parsingMode: PARSING_MODE.RESPONSES_API,
 *   userId: 'user123'
 * });
 * 
 * @example
 * // Using default hybrid mode
 * const result = await parseSyllabus(buffer, 'syllabus.pdf', { userId: 'user123' });
 */
export const parseSyllabus = async (
  fileBuffer,
  originalFilename,
  options = {}
) => {
  const config = new ParserConfig(options);
  const logger = {
    info: (msg) => console.log(`[INFO] ${msg}`),
    warning: (msg) => console.warn(`[WARNING] ${msg}`),
    error: (msg) => console.error(`[ERROR] ${msg}`),
    debug: (msg) => console.debug(`[DEBUG] ${msg}`),
  };

  const parser = new SyllabusParser(config, logger);
  return await parser.parse(fileBuffer, originalFilename);
};

// Export parsing modes for external use
export { PARSING_MODE };

export default parseSyllabus;
