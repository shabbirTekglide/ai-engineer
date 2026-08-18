/**
 * Enhanced Transcription Processor
 * ================================
 * 
 * Production-ready transcription processor that replaces Python scripts
 * with JavaScript OpenAI API integration. Implements the same strategies
 * as the Python script but uses OpenAI's Whisper API directly.
 * 
 * Features:
 * - OpenAI Whisper API integration
 * - Multi-pass transcription with quality assessment
 * - Audio analysis and optimization
 * - Parallel processing for large files
 * - Real-time progress tracking
 * - Comprehensive error handling
 * - Background processing with status updates
 * 
 * Author: AI Assistant
 * Version: 1.0.0
 */

import fs from 'fs/promises';
import { access } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createWriteStream } from 'fs';
import https from 'https';
import http from 'http';
import Lecture from '../models/lecture.js';
import {
  OpenAITranscriptionService,
  TranscriptionConfig,
  createTranscriptionService
} from './openaiTranscriptionService.js';
import {
  MistralTranscriptionService,
  createMistralTranscriptionService
} from './mistralTranscriptionService.js';
import {
  VelmaTranscriptionService,
  createVelmaTranscriptionService
} from './velmaTranscriptionService.js';
import { ACTIVE_TRANSCRIPTION_PROVIDER, MISTRAL_CONFIG, OPENAI_CONFIG, VELMA_CONFIG } from '../config/transcriptionConfig.js';
import { recordChatCompletionUsage, recordTranscriptionUsage } from './usageService.js';
import { getResponsesService } from './openaiResponsesService.js';
import User from '../models/User.js';

// gpt-4o-mini token limits
const MAX_OUTPUT_TOKENS = 16384; // 16K max output for gpt-4o-mini

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = path.join(__dirname, '..', 'temp');

/**
 * Enhanced Transcription Processor Class
 */
export class EnhancedTranscriptionProcessor {
  constructor(options = {}) {
    this.openaiApiKey = options.openaiApiKey || process.env.OPENAI_API_KEY;
    this.mistralApiKey = options.mistralApiKey || process.env.MISTRAL_API_KEY;
    this.velmaApiKey = options.velmaApiKey || process.env.VELMA_API_KEY;
    this.config = options.config || {};
    this.userId = options.userId || null;
    this.isProcessing = new Set(); // Track processing lectures
    this.transcriptionProvider = options.transcriptionProvider || ACTIVE_TRANSCRIPTION_PROVIDER || 'mistral';

    console.log(`[TranscriptionProcessor] Active provider: ${this.transcriptionProvider}`);
  }

  /**
   * Download file from URL with progress logging, timeout, redirect following,
   * and idempotent caching so retried jobs reuse an already-downloaded file.
   *
   * Why this matters: the previous bare implementation silently blocked the
   * pipeline for 5+ minutes while pulling multi-MB audio from S3, making it
   * impossible to tell whether the worker was stuck or progressing.
   */
  async downloadFile(url, outputPath, options = {}) {
    const {
      timeoutMs = parseInt(process.env.DOWNLOAD_TIMEOUT_MS, 10) || 10 * 60 * 1000, // 10 min default
      maxRedirects = 5,
      reuseExisting = true,
      progressLogIntervalMs = 5000
    } = options;

    if (reuseExisting) {
      try {
        const stat = await fs.stat(outputPath);
        if (stat.size > 0) {
          console.log(
            `[Download] Reusing cached audio at ${outputPath} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`
          );
          return outputPath;
        }
      } catch (_) {
        // file does not exist – proceed with download
      }
    }

    const startedAt = Date.now();

    const doGet = (currentUrl, redirectsLeft) =>
      new Promise((resolve, reject) => {
        const protocol = currentUrl.startsWith('https') ? https : http;
        console.log(`[Download] Starting download: ${currentUrl}`);

        const file = createWriteStream(outputPath);
        let received = 0;
        let total = 0;
        let lastLog = Date.now();
        let timer = null;

        const cleanupAndReject = (err) => {
          if (timer) clearTimeout(timer);
          try { file.close(); } catch (_) { /* noop */ }
          fs.unlink(outputPath).catch(() => { });
          reject(err);
        };

        const req = protocol.get(currentUrl, (response) => {
          const status = response.statusCode || 0;

          if (status >= 300 && status < 400 && response.headers.location) {
            response.resume();
            try { file.close(); } catch (_) { /* noop */ }
            if (redirectsLeft <= 0) {
              return reject(new Error(`Too many redirects while downloading ${url}`));
            }
            const nextUrl = new URL(response.headers.location, currentUrl).toString();
            console.log(`[Download] Following ${status} redirect → ${nextUrl}`);
            return doGet(nextUrl, redirectsLeft - 1).then(resolve, reject);
          }

          if (status !== 200) {
            return cleanupAndReject(
              new Error(`Failed to download: HTTP ${status} from ${currentUrl}`)
            );
          }

          total = parseInt(response.headers['content-length'], 10) || 0;
          if (total > 0) {
            console.log(`[Download] Content-Length: ${(total / 1024 / 1024).toFixed(2)} MB`);
          }

          response.on('data', (chunk) => {
            received += chunk.length;
            const now = Date.now();
            if (now - lastLog >= progressLogIntervalMs) {
              const mb = (received / 1024 / 1024).toFixed(2);
              const elapsedSec = ((now - startedAt) / 1000).toFixed(1);
              const speedKBps = ((received / 1024) / Math.max(0.1, (now - startedAt) / 1000)).toFixed(0);
              if (total > 0) {
                const pct = ((received / total) * 100).toFixed(1);
                console.log(`[Download] ${mb} MB / ${(total / 1024 / 1024).toFixed(2)} MB (${pct}%) - ${speedKBps} KB/s - ${elapsedSec}s`);
              } else {
                console.log(`[Download] ${mb} MB received - ${speedKBps} KB/s - ${elapsedSec}s`);
              }
              lastLog = now;
            }
          });

          response.pipe(file);

          file.on('finish', () => {
            if (timer) clearTimeout(timer);
            file.close();
            const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
            console.log(
              `[Download] Completed ${(received / 1024 / 1024).toFixed(2)} MB in ${elapsed}s → ${outputPath}`
            );
            resolve(outputPath);
          });

          file.on('error', cleanupAndReject);
          response.on('error', cleanupAndReject);
        });

        req.on('error', cleanupAndReject);
        req.setTimeout(timeoutMs, () => {
          req.destroy(new Error(`Download timeout after ${Math.round(timeoutMs / 1000)}s: ${currentUrl}`));
        });

        timer = setTimeout(() => {
          req.destroy(new Error(`Download wall-clock timeout after ${Math.round(timeoutMs / 1000)}s`));
        }, timeoutMs);
      });

    return doGet(url, maxRedirects);
  }

  /**
   * Generate a unique temp audio path to avoid collisions across concurrent requests.
   */
  getTempAudioPath(lectureId) {
    const rand = Math.random().toString(16).slice(2);
    return path.join(TEMP_DIR, `${lectureId}-${Date.now()}-${rand}.audio`);
  }

  /**
   * Create transcription configuration based on lecture characteristics
   * NOTE: Does NOT include lecture title in prompts to ensure content independence
   */
  createTranscriptionConfig(lecture, audioAnalysis) {
    // Determine which provider to use
    const provider = this.transcriptionProvider;

    if (provider === 'velma') {
      // Velma-2 configuration - 20-minute chunks, multilingual auto-detect.
      // Velma always returns JSON with utterance-level timestamps; prompt and
      // temperature are not used by the API but kept in the plain object for
      // interface parity with other providers.
      const baseConfig = {
        model: 'velma-2-stt-batch',
        language: null,                 // null = auto-detect
        responseFormat: 'json',
        enableTimestamp: true,
        enableRealTimeProgress: true,
        enableRetry: true,
        maxRetries: 3,
        chunkDurationSeconds: 1200,     // 20 minutes
        maxConcurrentChunks: 3,
        // Enrichment flags – overridable via this.config
        speakerDiarization: true,
        emotionSignal: false,
        accentSignal: false,
        piiPhiTagging: false,
        ...this.config
      };

      return baseConfig;
    }

    if (provider === 'mistral') {
      // Mistral configuration - optimized for 12-minute chunks
      const baseConfig = {
        model: 'voxtral-mini-latest',
        language: 'en',
        responseFormat: 'json',
        enableTimestamp: true,
        enableRealTimeProgress: true,
        enableRetry: true,
        maxRetries: 3,
        chunkDurationSeconds: 720, // 12 minutes
        maxConcurrentChunks: 3,
        ...this.config
      };

      // Generic transcription prompt - NO lecture title reference
      baseConfig.prompt = `Please transcribe accurately with proper punctuation and formatting.`;

      return baseConfig;
    }

    // Default: OpenAI Whisper configuration - original implementation
    const baseConfig = {
      model: 'whisper-1',
      language: 'en',
      responseFormat: 'verbose_json',
      enableTimestamp: true,
      enableRealTimeProgress: true,
      enableRetry: true,
      maxRetries: 3,
      ...this.config
    };

    // Optimize based on audio analysis
    if (audioAnalysis) {
      if (audioAnalysis.estimatedComplexity === 'high') {
        baseConfig.maxConcurrentChunks = 2;
        baseConfig.qualityThreshold = 'excellent';
      } else if (audioAnalysis.estimatedComplexity === 'low') {
        baseConfig.maxConcurrentChunks = 5;
        baseConfig.qualityThreshold = 'good';
      }

      if (audioAnalysis.duration > 3600) {
        baseConfig.chunkOverlapSeconds = 10;
      }
    }

    // Generic transcription prompt - NO lecture title reference
    baseConfig.prompt = `Please transcribe accurately with proper punctuation and formatting.`;

    return new TranscriptionConfig(baseConfig);
  }

  /**
   * Kora Brand System Prompt for Lecture Notes Generation
   * This follows the exact specifications from the client's LecturePrompt.txt
   * ENHANCED for maximum depth, detail, and comprehensive coverage
   * OUTPUT FORMAT: Markdown (not HTML)
   */
  getKoraNotesSystemPrompt() {
    return `You are an expert academic note-generation model. Your job is to take a raw lecture transcript and produce COMPREHENSIVE, DETAILED, and EXHAUSTIVE lecture notes in MARKDOWN format. Your output must always follow the same formatting and structure. Use only the information contained in the lecture.

CRITICAL REQUIREMENTS FOR DEPTH AND DETAIL
You MUST produce in-depth, comprehensive content that:
• Captures EVERY concept, idea, example, and explanation from the lecture
• Includes ALL equations, formulas, mathematical relationships, and technical notation mentioned
• Preserves the full complexity of advanced or technical concepts - NEVER simplify or omit
• Provides thorough explanations with multiple sub-bullets for each main point
• Matches the quantity and quality of a graduate-level study resource
• Extracts 10-15+ key concepts with detailed definitions and sub-explanations
• Creates 8-15 Main Explanation sections covering every topic discussed
• Each Main Explanation section should have 5-8 core bullets with 2-4 sub-bullets each

TASK
Generate HIGH-QUALITY, IN-DEPTH lecture notes in MARKDOWN format based solely on the transcript provided. Do not add outside facts. DO NOT simplify, abbreviate, or omit any technical content, equations, or advanced concepts.

OUTPUT FORMAT: MARKDOWN
Your output MUST be in clean, well-formatted Markdown. Use standard Markdown syntax:
• Use # for H1, ## for H2, ### for H3 headers
• Use - or * for bullet points, with proper indentation for sub-bullets
• Use **bold** for emphasis
• Use > for blockquotes
• Use | for tables with proper markdown table syntax
• Use code blocks with \`\`\` for equations if needed, but prefer inline formatting
• Use proper markdown list indentation (2 spaces for sub-items)

STYLE REQUIREMENTS
• No emojis.
• Neutral academic tone.
• Clear, detailed sentences that preserve technical precision.
• Clean section headers with descriptive titles.
• Bullets and sub-bullets only, not paragraphs.
• No LaTeX formatting or delimiters - use plain text for equations (e.g., "F = ma", "E = mc²", "ds² = g_mn dx^m dx^n").
• No invented information.
• PRESERVE all technical terminology, notation, and specialized vocabulary.

STRUCTURE REQUIREMENTS
Follow this structure exactly in every lecture output:

1. Overview
Write a COMPREHENSIVE 4-6 sentence summary that captures ALL the main ideas, themes, and scope of the lecture. This should give readers a complete picture of what the lecture covers.

2. Key Concepts (COMPREHENSIVE LIST)
• List ALL major terms, concepts, and vocabulary from the lecture (typically 10-15+ terms).
• For EACH term, provide:
  - A clear, thorough definition/explanation
  - Sub-bullets with additional context, examples, or clarifications mentioned by the lecturer
• Include technical terms, specialized vocabulary, and any named theories or principles.
• Do not skip any significant concept mentioned in the lecture.

3. Main Explanations (TurboLearn-Style Hierarchy) - MOST IMPORTANT SECTION
Break the lecture into ALL topics in the order taught. This is the core of the notes.
• Create a SEPARATE ### H3 section for EACH distinct topic discussed (typically 8-15 sections).
• Each topic section must include:
  - ### H3 header naming the topic
  - 5-8 core bullet points covering the main ideas
  - 2-4 sub-bullets under each main bullet for:
    * Clarifications and deeper explanations
    * Examples mentioned by the lecturer
    * Connections to other concepts
    * Technical details and specifications
• Capture the lecturer's reasoning, thought process, and logical flow.
• Include any thought experiments, analogies, or illustrations used.
• NO paragraphs - use hierarchical bullets only.
• Do NOT invent content, but DO capture everything that was said.

4. Tables (Use when lecture compares concepts)
• Create comparison tables whenever the lecturer draws explicit comparisons.
• Use standard Markdown table syntax with | separators.
• Include ALL comparison points mentioned.
• Tables should have clear headers.

5. Equations and Mathematical Relationships (CRITICAL - Include if present)
• DETECT and INCLUDE all equations, formulas, and mathematical relationships.
• Write in plain text format (no LaTeX).
• For each equation, include:
  - The equation itself
  - Variable definitions
  - Context or when it applies
• Group related equations together with descriptive sub-bullets.
• Do NOT omit any mathematical content - this is critical for technical lectures.
• Examples: "F = ma", "z' = z - (1/2)gt²", "ds² = g_mn dx^m dx^n"

6. Notable Quotes
• Include 3-5 significant quotes that capture key insights or memorable statements.
• Select quotes that clarify important concepts or represent the lecturer's perspective.
• Use Markdown blockquote syntax (>).

7. Implications or Takeaways
• Summarize 4-6 key implications and significance points.
• Use only information explicitly mentioned by the lecturer.
• Connect ideas to broader themes or applications discussed.

8. Student-Friendly Wrap-Up
• Provide a clear, accessible 4-6 bullet summary.
• Distill the most important points for student review.
• No new information - synthesize what was covered.

FINAL RULES
• Use ONLY information present in the lecture - never invent.
• Never mention "the transcript" or "the lecture states" - present information directly.
• No emojis.
• No LaTeX - use plain text for all equations.
• Output MUST be in Markdown format only (no HTML).
• Maintain identical formatting, spacing, and structure across all outputs.
• Omit any section for which the lecture did not provide content.
• PRIORITIZE COMPLETENESS - it is better to be thorough than brief.
• When in doubt, INCLUDE the content rather than omit it.`;
  }

  /**
   * Kora Brand System Prompt for Study Guide Generation
   * This follows the exact specifications from the client's study-guide-prompt.txt
   * ENHANCED for maximum depth, detail, and exam-focused comprehensiveness
   */
  getKoraStudyGuideSystemPrompt() {
    return `You are Kora, an expert academic study-assistant model. Your job is to take a raw lecture transcript and generate a COMPREHENSIVE, DETAILED, exam-focused study guide that follows the exact structure below while using Kora's brand styling and consistent HTML formatting.

CRITICAL REQUIREMENTS FOR DEPTH AND DETAIL
You MUST produce in-depth, comprehensive content that:
• Captures EVERY testable concept, definition, and explanation from the lecture
• Includes ALL equations, formulas, and technical relationships mentioned
• Preserves the full complexity of advanced concepts - NEVER simplify or omit technical content
• Creates a thorough resource suitable for exam preparation
• Extracts 10-15+ key terms with detailed, exam-focused definitions
• Develops 8-15 Core Ideas sections covering every major topic
• Generates comprehensive assessment questions that test deep understanding

Use only the information in the lecture.
No outside facts.
No embellishment.
No LaTeX anywhere in the output - use plain text for equations (e.g., "F = ma", "E = mc²").
No emojis.

GLOBAL STYLE REQUIREMENTS
Your output must always be a full HTML document that uses a polished, consistent visual format:
• Soft, neutral background: #f9fafb
• Centered content area (max width 900px)
• White content background with rounded corners and shadow
• System-UI font stack
• Body text color: #111827
• Consistent spacing and indentation
• Bullets and sub-bullets only (no paragraphs except where explicitly allowed)

KORA BRAND COLOR REQUIREMENTS
Use the Kora visual identity exactly:
Primary Kora Blue (#2160A0):
• All major section headers (H1, H2)
• H3 subheadings (style="color:#2160A0;")
• Accent lines or emphasis elements
Light Kora Blue (#E7F1FB):
• Table header backgrounds
• Highlight blocks
• Callout sections
Tables must include:
• Thin neutral borders (#d0dae4)
• Light-blue header row
• Clean cell padding
Quotes, if included, must have a left border in Primary Kora Blue.

STUDY GUIDE STRUCTURE

1. Overview
Write a comprehensive 3-5 sentence summary describing what the lecture covered, its main themes, and learning objectives.

2. Key Terms (Two-Column Table) - COMPREHENSIVE
Create a detailed table with ALL significant terms from the lecture:
• Column 1: Key term (use <strong> tags)
• Column 2: 1-3 sentence exam-focused definition with context
• Include 10-15+ terms for comprehensive lectures
• Include technical terminology, named concepts, theories, and specialized vocabulary
Rules:
• Light Kora Blue table header
• Thin neutral borders
• No outside information
• Include examples if explicitly stated in the lecture

3. Core Ideas & Explanations - MOST IMPORTANT SECTION
Break the lecture into ALL major topics in the order presented. This is the core study content.
• Create 8-15 separate sections depending on lecture complexity
• For each topic:
  - Use an H3 section header in Primary Kora Blue
  - Provide 5-8 essential bullet points covering the main ideas
  - Include 2-4 sub-bullets for each main bullet with:
    * Clarifications and deeper explanations
    * Examples mentioned by the lecturer
    * Distinctions and nuances stated
    * Technical details that may appear on exams
Rules:
• Absolutely no LaTeX anywhere - use plain text for equations
• No paragraphs - use hierarchical bullets
• No invented explanations
• Follow the sequence of ideas exactly as presented
• Capture ALL the lecturer's explanations, reasoning, and examples

4. Comparison Tables (When Comparisons Are Made)
• Include whenever the instructor made direct comparisons
• Create comprehensive tables with ALL comparison dimensions mentioned
• Use multiple columns when comparing 3+ items
Formatting:
• Light Kora Blue header row
• Thin borders
• Detailed but concise phrasing
• Capture every aspect compared

5. Equations & Relationships (CRITICAL - Include if present)
• DETECT and INCLUDE all equations, formulas, and mathematical relationships
• Write in plain text only (no LaTeX)
• For each equation, include:
  - The equation itself clearly written
  - Definitions of all variables
  - Context for when/how it applies
• Group related equations with clear organization
• Do NOT omit any mathematical content

6. Common Mistakes & Misconceptions
Include if the lecturer mentions common errors or misconceptions:
• Bullets should be exam-focused
• Include the misconception and the correct understanding
• Tied strictly to what the lecturer stated

7. Assessment-Style Questions - COMPREHENSIVE
Generate thorough exam-prep questions based ONLY on lecture content:

Recall Questions (5-7):
• Test definitions, facts, key concepts
• Cover major vocabulary and foundational knowledge

Application Questions (5-7):
• Short scenarios requiring conceptual application
• Test understanding beyond memorization
• Include questions about relationships between concepts

Critical Thinking Questions (3-4):
• Deeper reasoning questions
• Ask about implications, comparisons, or analysis
• Still tied strictly to lecture content

Tone should feel instructor-written and exam-appropriate.

8. Self-Quiz (No Answers)
Provide 8-12 short, direct questions for self-testing:
• Cover all major topics from the lecture
• Vary question types (what, how, why, compare, explain)
• Questions should require recall and understanding

9. Ten Things to Remember
Ten high-yield takeaways, one sentence each, strictly from the lecture:
• Prioritize the most exam-relevant concepts
• Cover the breadth of the lecture
• Write in clear, memorable language
• Include any key formulas or relationships mentioned

FINAL RULES
• Use ONLY lecture content - never invent or add outside information
• Never reference "the transcript" - present information directly
• No LaTeX anywhere - use plain text for all equations and formulas
• No emojis
• Maintain exact Kora-brand color hierarchy
• Maintain consistent HTML formatting
• Omit any section the lecture does not justify
• PRIORITIZE COMPLETENESS - a thorough study guide is more valuable than a brief one
• When in doubt, INCLUDE the content rather than omit it
• This guide should enable a student to fully prepare for an exam on this material`;
  }

  /**
   * Generate the base HTML template with Kora brand styling
   */
  getKoraHtmlTemplate() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lecture Notes</title>
  <style>
    :root {
      --kora-primary: #2160A0;
      --kora-light: #E7F1FB;
      --kora-text: #111827;
      --kora-bg: #f9fafb;
      --kora-border: #d0dae4;
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background-color: var(--kora-bg);
      color: var(--kora-text);
      line-height: 1.6;
      padding: 2rem 1rem;
    }
    
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      padding: 2.5rem;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    
    h1, h2 {
      color: var(--kora-primary);
      margin-bottom: 1rem;
    }
    
    h1 {
      font-size: 1.875rem;
      border-bottom: 2px solid var(--kora-primary);
      padding-bottom: 0.5rem;
      margin-bottom: 1.5rem;
    }
    
    h2 {
      font-size: 1.5rem;
      margin-top: 2rem;
      margin-bottom: 1rem;
    }
    
    h3 {
      font-size: 1.25rem;
      color: var(--kora-text);
      margin-top: 1.5rem;
      margin-bottom: 0.75rem;
    }
    
    ul {
      margin-left: 1.5rem;
      margin-bottom: 1rem;
    }
    
    li {
      margin-bottom: 0.5rem;
    }
    
    ul ul {
      margin-top: 0.5rem;
      margin-bottom: 0.5rem;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1.5rem 0;
    }
    
    th {
      background-color: var(--kora-light);
      color: var(--kora-text);
      font-weight: 600;
      text-align: left;
      padding: 0.75rem 1rem;
      border: 1px solid var(--kora-border);
    }
    
    td {
      padding: 0.75rem 1rem;
      border: 1px solid var(--kora-border);
    }
    
    blockquote {
      border-left: 4px solid var(--kora-primary);
      padding-left: 1rem;
      margin: 1rem 0;
      color: var(--kora-text);
      font-style: italic;
      background-color: #fafafa;
      padding: 1rem;
      border-radius: 0 4px 4px 0;
    }
    
    .overview {
      background-color: white;
      padding: 1rem;
      margin-bottom: 1.5rem;
    }
    
    .wrap-up {
      background-color: var(--kora-light);
      padding: 1.5rem;
      border-radius: 8px;
      margin-top: 2rem;
    }
    
    .wrap-up h2 {
      margin-top: 0;
    }
    
    .key-concepts {
      background-color: white;
    }
    
    hr {
      border: none;
      border-top: 2px solid var(--kora-primary);
      margin: 2rem 0;
    }
    
    .equation {
      background-color: #f8f9fa;
      padding: 1rem;
      border-radius: 4px;
      font-family: monospace;
      margin: 1rem 0;
    }
    
    strong {
      color: var(--kora-text);
    }
  </style>
</head>
<body>
  <div class="container">
    {{CONTENT}}
  </div>
</body>
</html>`;
  }

  /**
   * Generate AI-powered lecture notes using OpenAI with Kora brand styling
   * Uses the client's exact prompt specification from LecturePrompt.txt
   * 
   * NOTE: GPT-4o-mini has 128K token context window, so we use direct single-call
   * generation for all transcripts. Even a 3-hour lecture (~36K words) only uses
   * ~45K tokens, well within the limit.
   */
  async generateLectureNotes(transcript) {
    try {
      if (!this.openaiApiKey) {
        throw new Error('OpenAI API key not configured');
      }

      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: this.openaiApiKey });

      const transcriptTokens = this.estimateTokens(transcript);
      console.log(`Transcript estimated tokens: ${transcriptTokens}`);

      // Generate notes in a single API call - GPT-4o-mini handles 128K tokens
      const markdownNotes = await this.generateKoraNotes(openai, transcript);

      // Extract key takeaways from the generated markdown for the prompts
      const keyTakeaways = this.extractKeyTakeawaysFromMarkdown(markdownNotes);

      return {
        overview: markdownNotes,
        sections: [],
        summary: '',
        keyTakeaways: keyTakeaways,
        prompts: [
          "What are the main concepts covered in these notes?",
          "How do the key points relate to each other?",
          "What are the practical applications of this content?",
          "What questions should I ask myself to test my understanding?"
        ]
      };

    } catch (error) {
      console.error('AI notes generation failed:', error);
      throw error;
    }
  }

  /**
   * Generate Kora-branded Markdown lecture notes using OpenAI Responses API
   * Uses v1/responses endpoint - STATELESS (no cache or previous state)
   * Leverages GPT-4o-mini's 128K context window for full transcript processing
   * ENHANCED for maximum depth, detail, and comprehensive coverage
   * IMPORTANT: Does NOT include lecture title, class title, or syllabus references
   * OUTPUT FORMAT: Markdown (not HTML)
   */
  async generateKoraNotes(openai, transcript) {
    const systemPrompt = this.getKoraNotesSystemPrompt();

    // Get the Responses API service
    const responsesService = getResponsesService();

    // Use the centralized service method which uses Responses API
    const result = await responsesService.generateNotes(transcript, systemPrompt, this.userId);

    let markdownContent = result.markdown || result.html || '';

    // Remove markdown code block markers if present
    markdownContent = markdownContent.replace(/^```markdown\s*/i, "").replace(/^```\s*/, "").replace(/\s*```\s*$/, "");

    // Clean up any HTML tags that might have been included
    markdownContent = markdownContent.trim();

    return markdownContent;
  }

  /**
   * Extract key takeaways from generated Markdown notes
   */
  extractKeyTakeawaysFromMarkdown(markdown) {
    const takeaways = [];

    // Try to extract from the wrap-up section (look for "Wrap-Up" or "Student-Friendly Wrap-Up" heading)
    const wrapUpMatch = markdown.match(/(?:##|###)\s*(?:Student-Friendly\s+)?Wrap-Up\s*\n([\s\S]*?)(?=\n(?:##|###|$))/i);
    if (wrapUpMatch) {
      const wrapUpContent = wrapUpMatch[1];
      // Extract bullet points (lines starting with - or *)
      const bulletLines = wrapUpContent.match(/^[\s]*[-*]\s+(.+)$/gm);
      if (bulletLines) {
        for (const line of bulletLines.slice(0, 5)) {
          const text = line.replace(/^[\s]*[-*]\s+/, '').replace(/\*\*/g, '').trim();
          if (text) takeaways.push(text);
        }
      }
    }

    // Also try to extract from implications/takeaways section
    const takeawaysMatch = markdown.match(/(?:##|###)\s*(?:Implications|Takeaways|Key\s+Takeaways)[\s\S]*?\n([\s\S]*?)(?=\n(?:##|###|$))/i);
    if (takeawaysMatch && takeaways.length < 5) {
      const takeawaysContent = takeawaysMatch[1];
      const bulletLines = takeawaysContent.match(/^[\s]*[-*]\s+(.+)$/gm);
      if (bulletLines) {
        for (const line of bulletLines.slice(0, 5 - takeaways.length)) {
          const text = line.replace(/^[\s]*[-*]\s+/, '').replace(/\*\*/g, '').trim();
          if (text && !takeaways.includes(text)) takeaways.push(text);
        }
      }
    }

    return takeaways;
  }

  /**
   * Generate AI-powered study guide using OpenAI with Kora brand styling
   * This is called on-demand when user requests a study guide
   * @param {string} transcript - The lecture transcript text
   * @returns {Promise<string>} - HTML content of the study guide
   */
  async generateStudyGuide(transcript) {
    try {
      if (!this.openaiApiKey) {
        throw new Error('OpenAI API key not configured');
      }

      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: this.openaiApiKey });

      const transcriptTokens = this.estimateTokens(transcript);
      console.log(`[StudyGuide] Transcript estimated tokens: ${transcriptTokens}`);

      // Generate study guide in a single API call - GPT-4o-mini handles 128K tokens
      const htmlStudyGuide = await this.generateKoraStudyGuide(openai, transcript);

      console.log(`[StudyGuide] Generated successfully`);
      return htmlStudyGuide;

    } catch (error) {
      console.error('[StudyGuide] Generation failed:', error);
      throw error;
    }
  }

  /**
   * Generate Kora-branded HTML study guide using OpenAI Responses API
   * Uses v1/responses endpoint - STATELESS (no cache or previous state)
   * Leverages GPT-4o-mini's 128K context window for full transcript processing
   * ENHANCED for maximum depth, detail, and exam-focused comprehensiveness
   * IMPORTANT: Does NOT include lecture title, class title, or syllabus references
   */
  async generateKoraStudyGuide(openai, transcript) {
    const systemPrompt = this.getKoraStudyGuideSystemPrompt();

    // Get the Responses API service
    const responsesService = getResponsesService();

    // Use the centralized service method which uses Responses API
    const result = await responsesService.generateStudyGuide(transcript, systemPrompt, this.userId);

    let htmlContent = result.html || '';

    // Ensure the response is valid HTML
    if (!htmlContent.includes('<!DOCTYPE html>') && !htmlContent.includes('<html')) {
      // If the AI didn't return full HTML, wrap it in the template
      const template = this.getKoraHtmlTemplate();
      htmlContent = template.replace('{{CONTENT}}', htmlContent);
    }

    return htmlContent;
  }

  /**
   * Chunk transcript with overlap (Python strategy)
   */
  chunkTranscript(text, maxTokens = 3000, overlapTokens = 200) {
    const chunks = [];
    const paragraphs = text.split('\n\n');
    let currentChunk = [];
    let currentTokens = 0;
    let currentPos = 0;

    for (const para of paragraphs) {
      const paraTokens = this.estimateTokens(para);

      if (currentTokens + paraTokens > maxTokens && currentChunk.length > 0) {
        const chunkText = currentChunk.join('\n\n');
        chunks.push({
          text: chunkText,
          startPos: currentPos - chunkText.length,
          endPos: currentPos,
          tokens: currentTokens
        });

        // Start new chunk with overlap
        if (overlapTokens > 0 && currentChunk.length > 0) {
          const overlapText = currentChunk[currentChunk.length - 1];
          currentChunk = [overlapText, para];
          currentTokens = this.estimateTokens(overlapText) + paraTokens;
        } else {
          currentChunk = [para];
          currentTokens = paraTokens;
        }
      } else {
        currentChunk.push(para);
        currentTokens += paraTokens;
      }
      currentPos += para.length + 2;
    }

    if (currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.join('\n\n'),
        startPos: currentPos - currentChunk.join('\n\n').length,
        endPos: currentPos,
        tokens: currentTokens
      });
    }

    return chunks;
  }

  /**
   * Extract section title from generated notes
   */
  extractSectionTitle(notesText, sectionNumber) {
    const lines = notesText.split('\n');
    for (const line of lines.slice(0, 5)) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) {
        return trimmed.replace(/^#+\s*/, '').trim();
      }
    }
    return `Section ${sectionNumber}`;
  }

  /**
   * Generate summary of full notes using OpenAI Responses API
   * Uses v1/responses endpoint - STATELESS (no cache or previous state)
   * Note: With the new Kora HTML notes format, summaries are embedded in the HTML
   * This method is kept for backwards compatibility
   */
  async generateSummary(openai, fullNotes) {
    try {
      // Strip HTML tags if present to get plain text for summarization
      const plainText = fullNotes.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

      const userPrompt = `Please provide a brief summary (3-5 bullet points) of the following notes. 
The summary should capture the main themes, key concepts, and overall message.

**Notes:**
${plainText.slice(0, 4000)}

**Summary (as bullet points):`;

      const systemPrompt = 'You are an expert at synthesizing and summarizing academic content. Provide concise bullet-point summaries in a neutral academic tone. No emojis.';

      // Get the Responses API service
      const responsesService = getResponsesService();

      // Use Responses API - STATELESS
      const response = await responsesService.createResponse({
        input: userPrompt,
        instructions: systemPrompt,
        previousResponseId: null, // STATELESS
        temperature: 0.3,
        maxOutputTokens: 500,
        userId: this.userId,
        service: 'notes-summary'
      });

      return response.text || '';
    } catch (error) {
      console.error('Summary generation failed:', error);
      return '';
    }
  }

  /**
   * Extract key takeaways from notes using OpenAI Responses API
   * Uses v1/responses endpoint - STATELESS (no cache or previous state)
   * Note: With the new Kora HTML notes format, takeaways are extracted from the HTML structure
   * This method is kept for backwards compatibility
   */
  async extractKeyTakeaways(openai, fullNotes) {
    try {
      // Strip HTML tags if present to get plain text
      const plainText = fullNotes.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

      const userPrompt = `Please extract 5-7 key takeaways from the following notes. 
Each takeaway should be a concise, actionable insight or important concept.
Format as a numbered list.

**Notes:**
${plainText.slice(0, 4000)}

**Key Takeaways:**`;

      const systemPrompt = 'You are an expert at identifying key insights from academic content. No emojis. Use neutral academic tone.';

      // Get the Responses API service
      const responsesService = getResponsesService();

      // Use Responses API - STATELESS
      const response = await responsesService.createResponse({
        input: userPrompt,
        instructions: systemPrompt,
        previousResponseId: null, // STATELESS
        temperature: 0.3,
        maxOutputTokens: 400,
        userId: this.userId,
        service: 'key-takeaways'
      });

      const content = response.text || '';
      const takeaways = [];

      for (const line of content.split('\n')) {
        const match = line.match(/^[\d\-\*]+[\.\)]\s*(.+)$/);
        if (match) {
          takeaways.push(match[1]);
        }
      }

      return takeaways;
    } catch (error) {
      console.error('Key takeaways extraction failed:', error);
      return [];
    }
  }

  /**
   * Estimate token count (simple approximation)
   */
  estimateTokens(text) {
    return Math.ceil(text.length / 4); // Rough approximation: 4 chars per token
  }

  /**
   * Generate AI-powered quiz using OpenAI with Bloom's Taxonomy strategy
   * ENHANCED: Strict lecture-scoped generation to prevent content leakage
   */
  async generateQuiz(notes) {
    try {
      if (!this.openaiApiKey) {
        throw new Error('OpenAI API key not configured');
      }

      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: this.openaiApiKey });

      // Use comprehensive content coverage strategy from Python script
      const contentSections = this.splitIntoContentSections(notes.overview);

      // Generate a unique session ID to prevent cache collisions across lectures
      const sessionId = `quiz-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Parallelize: generate questions for all sections concurrently (batches of 5)
      const CONCURRENCY_LIMIT = 5;
      const allQuestions = [];

      for (let i = 0; i < contentSections.length; i += CONCURRENCY_LIMIT) {
        const batch = contentSections.slice(i, i + CONCURRENCY_LIMIT);
        const batchResults = await Promise.all(
          batch.map((section, batchIdx) => {
            const sectionIdx = i + batchIdx;
            return this.generateQuestionsForSection(
              openai,
              section,
              sectionIdx + 1,
              contentSections.length,
              0,
              sessionId
            ).catch(error => {
              console.error(`Failed to generate questions for section ${sectionIdx + 1}:`, error);
              return [];
            });
          })
        );
        for (const sectionQuestions of batchResults) {
          allQuestions.push(...sectionQuestions);
        }
      }

      return {
        title: 'Generated Quiz',
        questions: allQuestions,
        totalQuestions: allQuestions.length,
        difficultyDistribution: this.calculateDifficultyDistribution(allQuestions)
      };

    } catch (error) {
      console.error('AI quiz generation failed:', error);
      throw error;
    }
  }

  /**
   * Bloom's Taxonomy configuration (from Python script)
   */
  getBloomsTaxonomy() {
    return {
      remember: {
        level: 1,
        verbs: ["define", "identify", "list", "name", "recall", "state"],
        description: "Recall facts and basic concepts"
      },
      understand: {
        level: 2,
        verbs: ["describe", "explain", "summarize", "interpret", "classify"],
        description: "Explain ideas or concepts"
      },
      apply: {
        level: 3,
        verbs: ["apply", "demonstrate", "solve", "use", "execute"],
        description: "Use information in new situations"
      },
      analyze: {
        level: 4,
        verbs: ["analyze", "compare", "contrast", "distinguish", "examine"],
        description: "Draw connections among ideas"
      },
      evaluate: {
        level: 5,
        verbs: ["assess", "critique", "evaluate", "judge", "justify"],
        description: "Justify a decision or course of action"
      },
      create: {
        level: 6,
        verbs: ["create", "design", "develop", "formulate", "propose"],
        description: "Produce new or original work"
      }
    };
  }

  /**
   * Difficulty distributions (from Python script)
   */
  getDifficultyDistributions() {
    return {
      easy: { remember: 0.4, understand: 0.4, apply: 0.2 },
      medium: { understand: 0.3, apply: 0.4, analyze: 0.3 },
      hard: { apply: 0.2, analyze: 0.4, evaluate: 0.3, create: 0.1 },
      mixed: {
        remember: 0.15,
        understand: 0.25,
        apply: 0.25,
        analyze: 0.20,
        evaluate: 0.10,
        create: 0.05
      }
    };
  }

  /**
   * Split content into sections for comprehensive coverage
   */
  splitIntoContentSections(content) {
    const sections = [];
    const lines = content.split('\n');
    let currentSection = { title: 'Introduction', content: [] };

    for (const line of lines) {
      const trimmed = line.trim();

      // Check if this is a section header
      let isHeader = false;
      let title = '';

      if (trimmed.startsWith('#')) {
        // Markdown header
        isHeader = true;
        title = trimmed.replace(/^#+\s*/, '');
      } else if (trimmed.length > 0 && trimmed.length < 100 && trimmed === trimmed.toUpperCase()) {
        // All caps header
        isHeader = true;
        title = trimmed;
      } else if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
        // Bold header
        isHeader = true;
        title = trimmed.replace(/\*\*/g, '');
      }

      if (isHeader) {
        // Save current section if it has content
        if (currentSection.content.length > 0) {
          currentSection.content = currentSection.content.join('\n').trim();
          if (currentSection.content) {
            sections.push(currentSection);
          }
        }

        // Start new section
        currentSection = { title: title, content: [] };
      } else {
        // Add line to current section
        currentSection.content.push(line);
      }
    }

    // Add final section
    if (currentSection.content.length > 0) {
      currentSection.content = currentSection.content.join('\n').trim();
      if (currentSection.content) {
        sections.push(currentSection);
      }
    }

    // If no sections found, treat entire content as one section
    if (sections.length === 0) {
      sections.push({
        title: 'Complete Content',
        content: content
      });
    }

    return sections;
  }

  /**
   * Generate questions for a specific content section with Bloom's levels
   * ENHANCED: Uses session ID for strict content scoping
   */
  async generateQuestionsForSection(openai, section, sectionIdx, totalSections, questionCounter, sessionId = '') {
    const sectionContent = section.content;
    const sectionTitle = section.title;

    // Determine how many questions to generate based on content length
    const wordCount = sectionContent.split(' ').length;
    let targetQuestions = 3;

    if (wordCount < 200) targetQuestions = 3;
    else if (wordCount < 500) targetQuestions = 5;
    else if (wordCount < 1000) targetQuestions = 8;
    else if (wordCount < 2000) targetQuestions = 12;
    else targetQuestions = 15;

    // Build Bloom's level breakdown for a single combined API call
    const diffDist = this.getDifficultyDistributions().mixed;
    const bloomsTaxonomy = this.getBloomsTaxonomy();

    const bloomBreakdown = Object.entries(diffDist).map(([bloomLevel, proportion]) => {
      const count = Math.max(1, Math.floor(targetQuestions * proportion));
      const difficulty = this.mapBloomToDifficulty(bloomLevel);
      const bloomInfo = bloomsTaxonomy[bloomLevel];
      return { bloomLevel, count, difficulty, bloomInfo };
    });

    const totalToGenerate = bloomBreakdown.reduce((sum, b) => sum + b.count, 0);

    const bloomRequirements = bloomBreakdown.map(b =>
      `- ${b.count} questions at "${b.bloomLevel}" level (${b.bloomInfo.description}), difficulty: ${b.difficulty}, use verbs: ${b.bloomInfo.verbs.join(', ')}`
    ).join('\n');

    const uniqueId = sessionId || `q-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const systemPrompt = `You are an expert educational assessment designer. Generate high-quality quiz questions EXCLUSIVELY from the provided content.

STRICT RULES:
- ONLY use information from the PROVIDED CONTENT. No external knowledge.
- If content is insufficient, generate fewer questions rather than inventing content.
- Every question, answer, and distractor must be derivable from the content.
- Questions must be clear, unambiguous, and grammatically correct.
- Create realistic distractors for multiple-choice questions.
- DO NOT include letter prefixes (A., B., C., D.) in options.
- The correct_answer must exactly match one of the options.

Always respond with valid JSON containing a "questions" array.`;

    const prompt = `=== QUIZ GENERATION ===
Topic: "${sectionTitle}"
Generation ID: ${uniqueId}

Generate EXACTLY ${totalToGenerate} Multiple Choice questions from the content below, distributed as:

${bloomRequirements}

Each question needs: question_text, difficulty, bloom_level, 4 options (no letter prefixes), correct_answer (matching an option exactly), hint, and explanation.

=== CONTENT ===
${sectionContent}
=== END CONTENT ===

Response format:
{"questions":[{"question_text":"...","question_type":"multiple_choice","difficulty":"easy|medium|hard","bloom_level":"remember|understand|apply|analyze|evaluate|create","options":["...","...","...","..."],"correct_answer":"...","hint":"...","explanation":"..."}]}`;

    const responsesService = getResponsesService();

    const response = await responsesService.createResponse({
      input: prompt,
      instructions: systemPrompt,
      previousResponseId: null,
      temperature: 0.3,
      maxOutputTokens: 4000,
      userId: this.userId,
      service: 'quiz-generation'
    });

    // Parse JSON response
    let contentText = (response.text || '').trim();
    contentText = contentText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```\s*$/, '');

    const questionsData = JSON.parse(contentText);
    const questions = questionsData.questions || [];

    return questions
      .filter(q => this.validateQuestion(q, 'multiple_choice'))
      .map((q) => {
        const cleanedOptions = (q.options || []).map(opt =>
          opt.replace(/^[A-Da-d][.)]\s*/, '').replace(/^[1-4][.)]\s*/, '').trim()
        );

        const cleanedCorrectAnswer = q.correct_answer
          ? q.correct_answer.replace(/^[A-Da-d][.)]\s*/, '').replace(/^[1-4][.)]\s*/, '').trim()
          : '';

        const correctIndex = cleanedOptions.findIndex(opt => opt === cleanedCorrectAnswer);

        return {
          question: q.question_text,
          options: cleanedOptions,
          correctIndex: correctIndex >= 0 ? correctIndex : 0,
          hint: q.hint || '',
          explanation: q.explanation || '',
          difficulty: q.difficulty || 'medium',
          bloomLevel: q.bloom_level || 'understand',
          section: sectionTitle
        };
      });
  }


  /**
   * Map Bloom level to difficulty
   */
  mapBloomToDifficulty(bloomLevel) {
    const bloomsTaxonomy = this.getBloomsTaxonomy();
    const level = bloomsTaxonomy[bloomLevel]?.level || 1;

    if (level <= 2) return 'easy';
    else if (level <= 4) return 'medium';
    else return 'hard';
  }

  /**
   * Validate generated question
   */
  validateQuestion(question, questionType) {
    if (!question.question_text) return false;

    if (questionType === 'multiple_choice') {
      const options = question.options || [];
      return options.length >= 3 && question.correct_answer;
    }

    return true;
  }

  /**
   * Calculate difficulty distribution
   */
  calculateDifficultyDistribution(questions) {
    const distribution = { easy: 0, medium: 0, hard: 0 };

    for (const question of questions) {
      const difficulty = question.difficulty || 'medium';
      if (distribution[difficulty] !== undefined) {
        distribution[difficulty]++;
      }
    }

    return distribution;
  }

  /**
   * Generate AI-powered flashcards using OpenAI with sophisticated strategies
   * ENHANCED: Strict lecture-scoped generation to prevent content leakage
   */
  async generateFlashcards(notes) {
    try {
      if (!this.openaiApiKey) {
        throw new Error('OpenAI API key not configured');
      }

      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: this.openaiApiKey });

      // Use comprehensive content coverage strategy from Python script
      const contentSections = this.splitIntoContentSections(notes.overview);

      // Generate a unique session ID to prevent cache collisions across lectures
      const sessionId = `flashcard-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Parallelize: generate flashcards for all sections concurrently (batches of 5)
      const CONCURRENCY_LIMIT = 5;
      const allFlashcards = [];

      for (let i = 0; i < contentSections.length; i += CONCURRENCY_LIMIT) {
        const batch = contentSections.slice(i, i + CONCURRENCY_LIMIT);
        const batchResults = await Promise.all(
          batch.map((section, batchIdx) => {
            const sectionIdx = i + batchIdx;
            return this.generateFlashcardsForSection(
              openai,
              section,
              sectionIdx + 1,
              contentSections.length,
              0,
              sessionId
            ).catch(error => {
              console.error(`Failed to generate flashcards for section ${sectionIdx + 1}:`, error);
              return [];
            });
          })
        );
        for (const sectionCards of batchResults) {
          allFlashcards.push(...sectionCards);
        }
      }

      return {
        title: 'Generated Flashcards',
        flashcards: allFlashcards,
        totalCards: allFlashcards.length,
        cardTypes: this.calculateCardTypeDistribution(allFlashcards),
        difficultyDistribution: this.calculateFlashcardDifficultyDistribution(allFlashcards)
      };

    } catch (error) {
      console.error('AI flashcard generation failed:', error);
      throw error;
    }
  }

  /**
   * Flashcard type configurations (from Python script)
   */
  getFlashcardTypes() {
    return {
      basic: {
        name: "Basic",
        description: "Front side question, back side answer",
        structure: "Q&A"
      },
      cloze: {
        name: "Cloze Deletion",
        description: "Fill-in-the-blank style with context",
        structure: "Text with [...] blanks"
      },
      reversible: {
        name: "Reversible",
        description: "Can be tested in both directions (term↔definition)",
        structure: "Bidirectional"
      },
      list: {
        name: "List",
        description: "Question with multiple points to remember",
        structure: "Question with enumerated answer"
      }
    };
  }

  /**
   * Spaced Repetition intervals (from Python script)
   */
  getSRSIntervals() {
    return {
      new: 0,
      learning: 1,
      young: 3,
      mature: 7
    };
  }

  /**
   * Difficulty levels for SRS (from Python script)
   */
  getDifficultyLevels() {
    return {
      easy: { initialEase: 2.5, initialInterval: 4 },
      medium: { initialEase: 2.0, initialInterval: 1 },
      hard: { initialEase: 1.3, initialInterval: 1 }
    };
  }

  /**
   * Generate flashcards for a specific content section
   * ENHANCED: Uses session ID for strict content scoping
   */
  async generateFlashcardsForSection(openai, section, sectionIdx, totalSections, cardCounter, sessionId = '') {
    const sectionContent = section.content;
    const sectionTitle = section.title;

    // Determine how many flashcards to generate based on content length
    const wordCount = sectionContent.split(' ').length;
    let targetCards = 5;

    if (wordCount < 200) targetCards = 3;
    else if (wordCount < 500) targetCards = 5;
    else if (wordCount < 1000) targetCards = 8;
    else if (wordCount < 2000) targetCards = 12;
    else targetCards = 15;

    // Build card type breakdown for a single combined API call
    const flashcardTypes = this.getFlashcardTypes();
    const typeDistribution = { basic: 0.4, cloze: 0.3, reversible: 0.2, list: 0.1 };

    const typeBreakdown = Object.entries(typeDistribution).map(([cardType, proportion]) => {
      const count = Math.max(1, Math.floor(targetCards * proportion));
      const typeInfo = flashcardTypes[cardType];
      return { cardType, count, typeInfo };
    });

    const totalToGenerate = typeBreakdown.reduce((sum, t) => sum + t.count, 0);

    const typeRequirements = typeBreakdown.map(t =>
      `- ${t.count} "${t.cardType}" cards (${t.typeInfo.name}: ${t.typeInfo.description}, structure: ${t.typeInfo.structure})`
    ).join('\n');

    const uniqueId = sessionId || `fc-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const systemPrompt = `You are an expert educational content creator specializing in spaced repetition learning. Generate flashcards EXCLUSIVELY from the provided content.

STRICT RULES:
- ONLY use information from the PROVIDED CONTENT. No external knowledge.
- If content is insufficient, generate fewer cards rather than inventing content.
- Front side: Maximum 1-2 sentences (10-20 words max)
- Back side: Maximum 2-3 sentences (15-30 words max)
- NO paragraphs or lengthy explanations. One key idea per flashcard.
- Mnemonics and hints: 5-10 words max if included.

Always respond with valid JSON containing a "flashcards" array.`;

    const prompt = `=== FLASHCARD GENERATION ===
Topic: "${sectionTitle}"
Generation ID: ${uniqueId}

Generate EXACTLY ${totalToGenerate} flashcards from the content below, distributed as:

${typeRequirements}

Each card needs: card_type, front (10-20 words), back (15-30 words), hint (5-10 words), difficulty (easy|medium|hard), category, tags. Optional: mnemonic, example (keep brief).

For cloze cards: front must contain [...] blanks. For list cards: back should use bullet points.

=== CONTENT ===
${sectionContent}
=== END CONTENT ===

Response format:
{"flashcards":[{"card_type":"basic|cloze|reversible|list","front":"...","back":"...","mnemonic":"...","example":"...","hint":"...","difficulty":"easy|medium|hard","category":"${sectionTitle}","tags":["${sectionTitle}"]}]}`;

    const responsesService = getResponsesService();

    const response = await responsesService.createResponse({
      input: prompt,
      instructions: systemPrompt,
      previousResponseId: null,
      temperature: 0.5,
      maxOutputTokens: 3000,
      userId: this.userId,
      service: 'flashcards-generation'
    });

    // Parse JSON response
    let contentText = (response.text || '').trim();
    contentText = contentText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```\s*$/, '');

    const cardsData = JSON.parse(contentText);
    const cards = cardsData.flashcards || [];

    return cards
      .filter(card => this.validateFlashcard(card, card.card_type || 'basic'))
      .map((card) => {
        const difficulty = card.difficulty || 'medium';
        const difficultyInfo = this.getDifficultyLevels()[difficulty];

        return {
          term: card.front,
          definition: card.back,
          hint: card.hint || '',
          mnemonic: card.mnemonic || '',
          example: card.example || '',
          cardType: card.card_type || 'basic',
          difficulty: difficulty,
          category: card.category || sectionTitle,
          tags: card.tags || [],
          initialEaseFactor: difficultyInfo.initialEase,
          initialInterval: difficultyInfo.initialInterval,
          section: sectionTitle
        };
      });
  }


  /**
   * Validate generated flashcard
   */
  validateFlashcard(card, cardType) {
    if (!card.front || !card.back) return false;

    // Basic validation for different card types
    switch (cardType) {
      case 'basic':
        return card.front.length > 0 && card.back.length > 0;
      case 'cloze':
        return card.front.includes('[') && card.front.includes(']');
      case 'reversible':
        return card.front.length > 0 && card.back.length > 0;
      case 'list':
        return card.back.includes('\n') || card.back.includes('•') || card.back.includes('-');
      default:
        return true;
    }
  }

  /**
   * Calculate card type distribution
   */
  calculateCardTypeDistribution(flashcards) {
    const distribution = { basic: 0, cloze: 0, reversible: 0, list: 0 };

    for (const card of flashcards) {
      const cardType = card.cardType || 'basic';
      if (distribution[cardType] !== undefined) {
        distribution[cardType]++;
      }
    }

    return distribution;
  }

  /**
   * Calculate flashcard difficulty distribution
   */
  calculateFlashcardDifficultyDistribution(flashcards) {
    const distribution = { easy: 0, medium: 0, hard: 0 };

    for (const card of flashcards) {
      const difficulty = card.difficulty || 'medium';
      if (distribution[difficulty] !== undefined) {
        distribution[difficulty]++;
      }
    }

    return distribution;
  }

  /**
   * Parse markdown notes into structured format
   */
  parseNotesFromMarkdown(markdown) {
    const notes = {
      overview: '',
      keyPoints: [],
      prompts: []
    };

    try {
      // Extract the full text as overview
      const beforeSummary = markdown.split(/##\s+(Summary|Key Takeaways|Conclusion)/i)[0];
      notes.overview = beforeSummary.trim();

      // Extract key takeaways/key points
      const keyTakeawaysMatch = markdown.match(/##\s+Key Takeaways?\s*\n([\s\S]+?)(?=\n##|$)/i);
      if (keyTakeawaysMatch && keyTakeawaysMatch[1]) {
        const takeawaysText = keyTakeawaysMatch[1].trim();
        const lines = takeawaysText.split('\n');
        notes.keyPoints = lines
          .map(line => line.trim())
          .filter(line => /^[\d\-\*]+[\.\)]\s*.+/.test(line))
          .map(line => line.replace(/^[\d\-\*]+[\.\)]\s*/, '').trim())
          .filter(line => line.length > 0);
      }

      // If no key takeaways found, extract from main headings
      if (notes.keyPoints.length === 0) {
        const headingMatches = markdown.matchAll(/##\s+(.+?)$/gm);
        const headings = Array.from(headingMatches)
          .map(match => match[1].trim())
          .filter(heading =>
            !heading.match(/^(Summary|Key Takeaways|Overview|Conclusion)$/i) &&
            heading.length > 5
          )
          .slice(0, 5);

        if (headings.length > 0) {
          notes.keyPoints = headings;
        }
      }

      // Generate prompts based on the notes content
      notes.prompts = [
        "What are the main concepts covered in these notes?",
        "How do the key points relate to each other?",
        "What are the practical applications of this content?",
        "What questions should I ask myself to test my understanding?"
      ];

      // If we still don't have an overview, use a truncated version
      if (!notes.overview || notes.overview.length < 50) {
        notes.overview = markdown.substring(0, 500) + (markdown.length > 500 ? '...' : '');
      }

    } catch (error) {
      console.error('Error parsing notes structure:', error);
      notes.overview = markdown;
    }

    return notes;
  }

  /**
   * Parse JSON quiz output into structured format
   */
  parseQuizFromJson(jsonString) {
    try {
      const quizData = JSON.parse(jsonString);

      const title = quizData.title || 'Generated Quiz';
      const questions = quizData.questions || [];

      const formattedQuestions = questions.map((q, index) => ({
        question: q.question || '',
        options: q.options || [],
        correctIndex: q.correctIndex !== undefined ? q.correctIndex : 0,
        hint: q.hint || '',
        explanation: q.explanation || ''
      }));

      return {
        title,
        questions: formattedQuestions
      };

    } catch (error) {
      console.error('Error parsing quiz JSON:', error);
      throw new Error(`Failed to parse quiz JSON: ${error.message}`);
    }
  }

  /**
   * Parse JSON flashcard output into structured format
   */
  parseFlashcardsFromJson(jsonString) {
    try {
      const flashcardData = JSON.parse(jsonString);

      const title = flashcardData.title || 'Generated Flashcards';
      const flashcards = flashcardData.flashcards || [];

      const formattedCards = flashcards.map((card) => ({
        term: card.term || '',
        definition: card.definition || '',
        hint: card.hint || ''
      }));

      return {
        title,
        cards: formattedCards
      };

    } catch (error) {
      console.error('Error parsing flashcard JSON:', error);
      throw new Error(`Failed to parse flashcard JSON: ${error.message}`);
    }
  }

  /**
   * Main transcription processing method
   */
  async processTranscription(lectureId, options = {}) {
    if (this.isProcessing.has(lectureId)) {
      throw new Error(`Lecture ${lectureId} is already being processed`);
    }

    this.isProcessing.add(lectureId);
    console.log(`Starting enhanced transcription processing for lecture: ${lectureId}`);

    let lecture = null;
    let tempAudioPath = null;
    let shouldCleanupTempAudio = false;

    try {
      // Ensure userId is set for all downstream usage logging
      if (!this.userId && options.userId) {
        this.userId = options.userId;
      }

      // 1. Find the lecture
      lecture = await Lecture.findById(lectureId);
      if (!lecture) {
        throw new Error('Lecture not found');
      }
      if (!this.userId) {
        this.userId = lecture.ownerId;
      }

      if (!lecture.audioUrl && !lecture.localAudioPath && lecture.sourceType !== 'document') {
        throw new Error('Lecture has no audio or document source');
      }

      // 2. Update status to processing
      lecture.processingStatus = 'processing';
      lecture.processingError = null;
      await lecture.save();
      console.log(`Lecture ${lectureId} status set to processing`);

      // 3. Create temp directory if it doesn't exist
      await fs.mkdir(TEMP_DIR, { recursive: true });

      let transcriptionResult = null;
      let updatedLecture = null
      let audioAnalysis = null;
      if (lecture.sourceType === 'document') {
        // DOCUMENT PATH
        const docUrl = lecture.sourceFile?.url;
        const ext = lecture.sourceFile?.extension || 'pdf';

        if (!docUrl) throw new Error('Lecture has no document source URL');

        console.log(`[Document] Downloading document from: ${docUrl}`);
        const tempDocPath = path.join(TEMP_DIR, `${lectureId}.doc.${ext}`);
        await this.downloadFile(docUrl, tempDocPath);

        const { extractTextFromDocument } = await import('./documentParsingService.js');
        let extractedText = await extractTextFromDocument(tempDocPath, ext);
        console.log(`[Document] Extracted text: ${JSON.stringify(extractedText)}`);
        // 🔧 Ensure extractedText is a string (fix for PPTX/object returns)
        if (typeof extractedText !== 'string') {
          extractedText = extractedText?.text || extractedText?.content || JSON.stringify(extractedText);
        }

        await fs.unlink(tempDocPath).catch(() => { });

        transcriptionResult = {
          text: extractedText,
          language: 'en',
          wordCount: extractedText.split(/\s+/).length,
          confidence: 1.0,
          processingTime: 0,
          model: 'document-parser',
          segments: []
        };

        if (options.onProgress) {
          options.onProgress({
            stage: 'transcription',
            progress: 100,
            details: { completed: 1, total: 1 }
          });
        }

        updatedLecture = await Lecture.findByIdAndUpdate(
          lecture._id,
          {
            $set: {
              transcript: {
                language: transcriptionResult.language,
                wordCount: transcriptionResult.wordCount,
                text: transcriptionResult.text,
                asr: {
                  provider: 'document-parser',
                  model: 'pdf-parse/mammoth',
                  confidence: 1.0,
                  durationMs: 0
                },
                segments: [],
                sourceHash: ''
              }
            }
          },
          { new: true }
        );
        console.log(`[Document] Transcript saved successfully`);

      } else {
        // AUDIO PATH
        // 4. Get audio file - Primary: Download from Cloudinary, Fallback: Local file (legacy)
        if (lecture.audioUrl) {
          // PRIMARY PATH: Download audio from Cloudinary CDN
          console.log(`[Cloudinary] Downloading audio from: ${lecture.audioUrl}`);
          tempAudioPath = this.getTempAudioPath(lectureId);
          await this.downloadFile(lecture.audioUrl, tempAudioPath);
          shouldCleanupTempAudio = true;
          console.log(`[Cloudinary] Audio downloaded to: ${tempAudioPath}`);
        } else if (lecture.localAudioPath) {
          // LEGACY PATH: Use local file if it exists (for backward compatibility)
          const filePath = lecture.localAudioPath;

          // Check if local file exists
          try {
            await access(filePath);
            tempAudioPath = filePath;
            console.log(`[Local] Using local audio file: ${tempAudioPath}`);
          } catch (error) {
            throw new Error(`Local audio file not found: ${error.message}`);
          }
        } else {
          throw new Error('No audio source available (neither Cloudinary URL nor local path)');
        }

        // 5. Initialize transcription service based on provider
        let transcriptionService;
        let providerName;

        if (this.transcriptionProvider === 'velma') {
          console.log('[Velma] Initializing Modulate Velma-2 transcription service...');
          if (!this.velmaApiKey) {
            throw new Error('Velma (Modulate) API key not configured');
          }
          transcriptionService = createVelmaTranscriptionService(this.velmaApiKey);
          providerName = 'modulate-velma-2';
        } else if (this.transcriptionProvider === 'mistral') {
          console.log('[Mistral] Initializing Mistral transcription service...');
          if (!this.mistralApiKey) {
            throw new Error('Mistral API key not configured');
          }
          transcriptionService = createMistralTranscriptionService(this.mistralApiKey);
          providerName = 'mistral-voxtral';
        } else {
          console.log('[OpenAI] Initializing OpenAI transcription service...');
          if (!this.openaiApiKey) {
            throw new Error('OpenAI API key not configured');
          }
          transcriptionService = createTranscriptionService(this.openaiApiKey);
          providerName = 'openai-whisper';
        }

        // 6. Analyze audio for optimization
        console.log(`[${this.transcriptionProvider.toUpperCase()}] Analyzing audio for optimization...`);
        audioAnalysis = await transcriptionService.analyzeAudio(tempAudioPath);
        console.log(`[${this.transcriptionProvider.toUpperCase()}] Audio analysis completed:`, audioAnalysis);

        // 7. Create optimized configuration
        const transcriptionConfig = this.createTranscriptionConfig(lecture, audioAnalysis);

        // Apply configuration to service (Mistral / Velma both use plain-object configs)
        if (
          (this.transcriptionProvider === 'mistral' || this.transcriptionProvider === 'velma') &&
          transcriptionService.config
        ) {
          Object.assign(transcriptionService.config, transcriptionConfig);
        }

        // 8. Transcribe audio
        console.log(`[${this.transcriptionProvider.toUpperCase()}] Starting transcription...`);
        transcriptionResult = await transcriptionService.transcribe(tempAudioPath, {
          onProgress: (progress) => {
            console.log(`[${this.transcriptionProvider.toUpperCase()}] Transcription progress: ${progress.progress}% (${progress.completed}/${progress.total})`);
            if (options.onProgress) {
              options.onProgress({
                stage: 'transcription',
                progress: progress.progress,
                details: progress
              });
            }
          }
        });

        console.log(`[${this.transcriptionProvider.toUpperCase()}] Transcription completed. Length: ${transcriptionResult.text.length} characters`);
        console.log(`[${this.transcriptionProvider.toUpperCase()}] Confidence: ${transcriptionResult.confidence.toFixed(3)}`);

        // Log transcription usage per user (overall file duration)
        try {
          const providerDefaultModel = (
            this.transcriptionProvider === 'velma' ? 'velma-2-stt-batch'
              : this.transcriptionProvider === 'mistral' ? 'voxtral-mini-latest'
                : 'whisper-1'
          );
          const modelUsed = transcriptionResult.model || transcriptionConfig.model || providerDefaultModel;
          const audioSeconds = audioAnalysis?.duration || 0;
          await recordTranscriptionUsage({
            userId: this.userId || lecture.ownerId,
            service: 'lecture-transcription',
            model: modelUsed,
            audioSeconds,
            metadata: {
              lectureId: lecture._id,
              provider: this.transcriptionProvider
            }
          });
        } catch (logErr) {
          console.warn('Transcription usage logging failed:', logErr?.message);
        }

        if (!transcriptionResult.text || transcriptionResult.text.trim().length === 0) {
          throw new Error('Transcription produced empty result');
        }

        // 9. Save transcript to database
        updatedLecture = await Lecture.findByIdAndUpdate(
          lecture._id,
          {
            $set: {
              transcript: {
                language: transcriptionResult.language,
                wordCount: transcriptionResult.wordCount,
                text: transcriptionResult.text,
                asr: {
                  provider: providerName,
                  model: transcriptionResult.model,
                  confidence: transcriptionResult.confidence,
                  durationMs: transcriptionResult.processingTime
                },
                segments: transcriptionResult.segments,
                sourceHash: '' // Add if you have this data
              }
            }
          },
          { new: true }
        );
        console.log(`[${this.transcriptionProvider.toUpperCase()}] Transcript saved successfully`);
      }

      // 10. Generate AI-powered lecture notes
      let notes = null;
      try {
        console.log('Generating AI lecture notes...');
        if (options.onProgress) {
          options.onProgress({ stage: 'notes', progress: 0 });
        }

        notes = await this.generateLectureNotes(transcriptionResult.text);
        console.log(`AI notes generated successfully`);

        await Lecture.findByIdAndUpdate(
          lecture._id,
          {
            $set: {
              notes: {
                overview: notes.overview,
                keyPoints: notes.keyPoints,
                prompts: notes.prompts
              }
            }
          }
        );
        console.log(`AI notes saved to database`);

        if (options.onProgress) {
          options.onProgress({ stage: 'notes', progress: 100 });
        }

      } catch (notesError) {
        console.error(`Notes generation failed: ${notesError.message}`);
        // Don't fail the entire process if notes generation fails
        notes = this.generateFallbackNotes(transcriptionResult.text);

        await Lecture.findByIdAndUpdate(
          lecture._id,
          {
            $set: {
              notes: {
                overview: notes.overview,
                keyPoints: notes.keyPoints,
                prompts: notes.prompts
              }
            }
          }
        );
        console.log(`Fallback notes saved to database`);
      }

      // 11. Generate AI-powered quiz
      let quiz = null;
      if (notes && notes.overview) {
        try {
          console.log('Generating AI quiz...');
          if (options.onProgress) {
            options.onProgress({ stage: 'quiz', progress: 0 });
          }

          quiz = await this.generateQuiz(notes);
          console.log(`AI quiz generated successfully`);

          await Lecture.findByIdAndUpdate(
            lecture._id,
            {
              $set: {
                quiz: {
                  title: quiz.title,
                  questions: quiz.questions
                }
              }
            }
          );
          console.log(`AI quiz saved to database`);

          if (options.onProgress) {
            options.onProgress({ stage: 'quiz', progress: 100 });
          }

        } catch (quizError) {
          console.error(`Quiz generation failed: ${quizError.message}`);
          // Quiz generation is optional
          console.log(`Continuing without quiz generation`);
        }
      }

      // 12. Generate AI-powered flashcards
      let flashcards = null;
      if (notes && notes.overview) {
        try {
          console.log('Generating AI flashcards...');
          if (options.onProgress) {
            options.onProgress({ stage: 'flashcards', progress: 0 });
          }

          flashcards = await this.generateFlashcards(notes);
          console.log(`AI flashcards generated successfully`);

          await Lecture.findByIdAndUpdate(
            lecture._id,
            {
              $set: {
                flashCards: {
                  cards: flashcards.flashcards
                }
              }
            }
          );
          console.log(`AI flashcards saved to database`);

          if (options.onProgress) {
            options.onProgress({ stage: 'flashcards', progress: 100 });
          }

        } catch (flashcardError) {
          console.error(`Flashcard generation failed: ${flashcardError.message}`);
          // Flashcard generation is optional
          console.log(`Continuing without flashcard generation`);
        }
      }

      // 13. Update lecture status to completed
      lecture.processingStatus = 'completed';
      lecture.processingError = null;
      await lecture.save();
      console.log(`Lecture ${lectureId} processing completed successfully`);
      // // Update user subscription status
      //    const user = await User.findById(this.userId);
      //    console.log(`Checking subscription for user ${this.userId}: Type=${user.subscriptionType}, Status=${user.subscriptionStatus}`);
      //    if(user.subscriptionType === 'free' ) {
      //      user.subscriptionStatus = 'completed';
      //      await user.save();
      //      console.log(`User ${this.userId} subscription status updated to compleed`);
      //    }

      return {
        success: true,
        lecture: updatedLecture,
        transcription: transcriptionResult,
        notes,
        quiz,
        flashcards,
        processingStats: {
          totalProcessingTime: Date.now() - Date.now(), // Will be calculated properly
          transcriptionTime: transcriptionResult.processingTime,
          audioAnalysis: audioAnalysis,
          confidence: transcriptionResult.confidence
        }
      };

    } catch (error) {
      console.error(`Enhanced transcription processing failed for lecture ${lectureId}:`, error);

      // Update lecture status to failed
      if (lecture) {
        lecture.processingStatus = 'failed';
        //shabbir
        try {

          // Update user subscription status
          const user = await User.findById(this.userId);
          console.log(`Checking subscription for user ${this.userId}: Type=${user.subscription.plan_id}, Status=${user.subscription.status}`);
          // if(user.subscriptionType === 'free' && user.subscriptionStatus == 'completed') {
          //   user.subscriptionStatus = 'active';
          //   await user.save();
          //   console.log(`User ${this.userId} subscription status updated to active`);
          //}
          user.subscription.availableSeconds += Math.ceil((lecture.durationSec || 0));
          await user.save();
          console.log(`User ${this.userId} refunded ${Math.ceil((lecture.durationSec || 0))} seconds`);

          lecture.processingError = error.message;
          await lecture.save();
        } catch (error) {
          console.error(`Failed to update lecture status to failed: ${error.message}`);

        }
      }

      throw error;
    } finally {
      // Cleanup
      this.isProcessing.delete(lectureId);

      if (tempAudioPath) {
        // Only delete files we downloaded to TEMP_DIR; never delete user-provided local paths.
        if (shouldCleanupTempAudio) {
          await fs.unlink(tempAudioPath).catch(() => { });
        }
      }
    }
  }

  /**
   * Generate fallback notes if AI generation fails
   * Now generates HTML in Kora brand format
   */
  generateFallbackNotes(transcriptText) {
    const words = transcriptText.split(/\s+/);
    const wordCount = words.length;

    const overviewText = transcriptText.length > 500
      ? transcriptText.substring(0, 500) + '...'
      : transcriptText;

    const keywordPatterns = /\b(important|key|main|critical|essential|note|remember)\b/i;
    const sentences = transcriptText.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
    const keyPoints = sentences
      .filter(s => keywordPatterns.test(s))
      .slice(0, 5);

    if (keyPoints.length === 0 && sentences.length > 0) {
      keyPoints.push(...sentences.slice(0, Math.min(3, sentences.length)));
    }

    // Generate Markdown fallback
    const keyPointsMarkdown = keyPoints.length > 0
      ? `## Key Points\n\n${keyPoints.map(p => `- ${p}`).join('\n')}\n`
      : '';

    const markdownContent = `# Lecture Notes

> **Note:** These are automatically extracted notes. Full AI-generated notes could not be created at this time.

## Overview

${overviewText}

${keyPointsMarkdown}
## Summary

This lecture contains approximately ${wordCount} words. Review the key points above for the main concepts covered.
`;

    return {
      overview: markdownContent,
      keyPoints,
      prompts: [
        "What are the main concepts discussed in this lecture?",
        "How do the key ideas relate to each other?",
        "What practical applications can be derived from this content?"
      ]
    };
  }

  /**
   * Escape HTML special characters
   */
  escapeHtml(text) {
    const htmlEntities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return text.replace(/[&<>"']/g, char => htmlEntities[char]);
  }

  /**
   * Check if a lecture is currently being processed
   */
  isLectureProcessing(lectureId) {
    return this.isProcessing.has(lectureId);
  }

  /**
   * Get processing status for a lecture
   */
  async getProcessingStatus(lectureId) {
    const lecture = await Lecture.findById(lectureId).select('processingStatus processingError');
    if (!lecture) {
      return { status: 'not_found' };
    }

    return {
      status: lecture.processingStatus,
      error: lecture.processingError,
      isProcessing: this.isProcessing.has(lectureId)
    };
  }
}

/**
 * Process transcription in background (non-blocking)
 */
export async function processTranscriptionAsync(lectureId, options = {}) {
  const processor = new EnhancedTranscriptionProcessor({
    openaiApiKey: process.env.OPENAI_API_KEY,
    mistralApiKey: process.env.MISTRAL_API_KEY,
    velmaApiKey: process.env.VELMA_API_KEY,
    config: options.config,
    userId: options.userId,
    transcriptionProvider: options.transcriptionProvider || ACTIVE_TRANSCRIPTION_PROVIDER
  });

  // Run in background without blocking the response
  processor.processTranscription(lectureId, options)
    .then(() => {
      console.log(`Background enhanced transcription completed for lecture: ${lectureId}`);
    })
    .catch((error) => {
      console.error(`Background enhanced transcription failed for lecture: ${lectureId}`, error);
    });
}

/**
 * Legacy compatibility function
 */
export async function processTranscription(lectureId) {
  const processor = new EnhancedTranscriptionProcessor({
    openaiApiKey: process.env.OPENAI_API_KEY,
    mistralApiKey: process.env.MISTRAL_API_KEY,
    velmaApiKey: process.env.VELMA_API_KEY,
    transcriptionProvider: ACTIVE_TRANSCRIPTION_PROVIDER
  });

  return await processor.processTranscription(lectureId);
}

/**
 * Default export
 */
export default EnhancedTranscriptionProcessor;
