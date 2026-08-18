// services/comprehensionService.js
import OpenAI from "openai";
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { fetchChatContext } from "./chatContextService.js";
import chatContextService from "./chatContextService.js";
import { recordChatCompletionUsage, recordTranscriptionUsage, recordTTSUsage, probeAudioDurationSeconds } from "./usageService.js";
import { getResponsesService } from "./openaiResponsesService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = path.join(__dirname, '..', 'temp');

// Initialize OpenAI client with 30 minutes timeout for Whisper API
const WHISPER_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: WHISPER_TIMEOUT_MS // 30 minutes timeout for API requests
});

// Initialize OpenAI Responses API service for comprehension Q&A
// Using v1/responses endpoint for:
// - 40-80% better cache utilization (reduced latency and costs)
// - Stateful conversations and multimodal support
const responsesService = getResponsesService();

/**
 * Process audio question and generate audio response
 * Full pipeline: Audio → Text → AI Response → Audio
 * 
 * @param {Buffer} audioBuffer - Input audio buffer
 * @param {string} userId - User ID for context
 * @param {string} classId - Class ID
 * @param {Array<string>} lectureIds - Array of lecture IDs
 * @param {string} mimetype - Audio MIME type (e.g., 'audio/m4a', 'audio/webm')
 * @returns {Promise<{text: string, audioBuffer: Buffer}>} - Response with text and audio buffer
 */
export async function processComprehensionAudio(audioBuffer, userId, classId, lectureIds, mimetype = 'audio/webm') {
  console.log('[Comprehension Service] Starting audio processing pipeline...');
  console.log(`[Comprehension Service] Processing for ${lectureIds.length} lectures, format: ${mimetype}`);
  
  let tempAudioPath = null;
  
  try {
    // ========== STEP 1: TRANSCRIBE AUDIO QUESTION ==========
    console.log('[Comprehension Service] Step 1: Transcribing audio...');
    const questionText = await transcribeAudioWithWhisper(audioBuffer, userId, mimetype);
    console.log(`[Comprehension Service] Transcribed question: "${questionText}"`);

    if (!questionText || questionText.trim().length === 0) {
      throw new Error('Transcription produced empty result. Please speak more clearly.');
    }

    // ========== STEP 2: FETCH MULTIPLE LECTURES CONTEXT ==========
    console.log('[Comprehension Service] Step 2: Fetching context for multiple lectures...');
    const context = await chatContextService.fetchMultipleLecturesContext(
      userId,
      lectureIds,
      classId
    );
    console.log('[Comprehension Service] Context fetched successfully');

    // ========== STEP 3: GENERATE AI RESPONSE ==========
    console.log('[Comprehension Service] Step 3: Generating AI response...');
    const responseText = await generateComprehensionResponse(
      questionText,
      context,
      userId
    );
    console.log(`[Comprehension Service] Generated response: "${responseText.substring(0, 100)}..."`);

    // ========== STEP 4: CONVERT RESPONSE TO SPEECH ==========
    console.log('[Comprehension Service] Step 4: Converting response to speech...');
    const responseAudioBuffer = await convertTextToSpeech(responseText, userId);
    console.log(`[Comprehension Service] Generated audio: ${responseAudioBuffer.length} bytes`);

    // ========== CLEANUP & RETURN ==========
    if (tempAudioPath) {
      await fs.unlink(tempAudioPath).catch(() => {});
    }

    return {
      text: responseText,
      audioBuffer: responseAudioBuffer
    };

  } catch (error) {
    console.error('[Comprehension Service] Pipeline error:', error);
    
    // Cleanup temp files on error
    if (tempAudioPath) {
      await fs.unlink(tempAudioPath).catch(() => {});
    }

    throw error;
  }
}

/**
 * Get file extension from MIME type
 * @param {string} mimetype - Audio MIME type
 * @returns {string} - File extension
 */
function getExtensionFromMimetype(mimetype) {
  const mimeToExt = {
    'audio/webm': 'webm',
    'audio/wav': 'wav',
    'audio/wave': 'wav',
    'audio/x-wav': 'wav',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/mp4': 'm4a',
    'audio/m4a': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/ogg': 'ogg',
    'audio/aac': 'aac',
  };
  return mimeToExt[mimetype] || 'webm';
}

/**
 * Transcribe audio using OpenAI Whisper API with Python fallback
 * @param {Buffer} audioBuffer - Audio file buffer
 * @param {string} userId - User ID
 * @param {string} mimetype - Audio MIME type
 * @returns {Promise<string>} - Transcribed text
 */
async function transcribeAudioWithWhisper(audioBuffer, userId, mimetype = 'audio/webm') {
  let tempFilePath = null;
  
  try {
    // Ensure temp directory exists
    await fs.mkdir(TEMP_DIR, { recursive: true });

    // Save buffer to temporary file with correct extension based on mimetype
    const fileExtension = getExtensionFromMimetype(mimetype);
    const tempFileName = `comprehension_${Date.now()}.${fileExtension}`;
    tempFilePath = path.join(TEMP_DIR, tempFileName);
    await fs.writeFile(tempFilePath, audioBuffer);

    console.log('[Whisper] Calling OpenAI Whisper API...');
    console.log('[Whisper] File saved:', tempFilePath, 'mimetype:', mimetype);
    
    try {
      // Try OpenAI Whisper API first
      const fileStream = createReadStream(tempFilePath);
      
      const transcription = await openai.audio.transcriptions.create({
        file: fileStream,
        model: "whisper-1",
        language: "en",
        response_format: "text"
      });

      // Probe duration for cost estimation before cleanup
      try {
        const audioSeconds = await probeAudioDurationSeconds(tempFilePath);
        await recordTranscriptionUsage({
          userId,
          service: 'comprehension-transcription',
          model: 'whisper-1',
          audioSeconds,
          metadata: { source: 'openai', file: tempFilePath }
        });
      } catch (logErr) {
        console.warn('[Whisper] Usage logging failed:', logErr?.message);
      }

      // Cleanup temp file
      await fs.unlink(tempFilePath).catch(() => {});

      console.log('[Whisper] OpenAI API transcription successful');
      
      const transcriptText = typeof transcription === 'string' 
        ? transcription 
        : transcription.text || transcription.toString();
        
      if (!transcriptText || transcriptText.trim().length === 0) {
        throw new Error('Transcription produced empty result');
      }
        
      return transcriptText.trim();

    } catch (apiError) {
      // Check if it's a permission/access error
      const isAccessError = apiError.status === 403 || 
                           apiError.code === 'model_not_found' ||
                           apiError.message?.includes('does not have access');

      if (isAccessError) {
        console.warn('[Whisper] OpenAI API access denied, trying Python Whisper fallback...');
        
        // Fall back to local Python Whisper
        return await transcribeWithPythonWhisper(tempFilePath);
      }
      
      // For other errors, rethrow
      throw apiError;
    }

  } catch (error) {
    console.error('[Whisper] Transcription error:', error);
    console.error('[Whisper] Error details:', {
      message: error.message,
      code: error.code,
      type: error.type,
      status: error.status
    });
    
    // Cleanup temp file on error
    if (tempFilePath) {
      await fs.unlink(tempFilePath).catch(() => {});
    }
    
    // Provide user-friendly error messages
    if (error.status === 403 || error.code === 'model_not_found') {
      throw new Error(
        'OpenAI Whisper API access not available. Please enable Whisper API in your OpenAI account at https://platform.openai.com/account/limits or set up billing at https://platform.openai.com/settings/organization/billing'
      );
    }
    
    throw new Error(`Audio transcription failed: ${error.message}`);
  }
}

/**
 * Convert WebM audio to WAV format using ffmpeg
 * @param {string} inputPath - Path to WebM file
 * @returns {Promise<string>} - Path to converted WAV file
 */
async function convertWebMToWav(inputPath) {
  const { spawn } = await import('child_process');
  
  return new Promise((resolve, reject) => {
    const outputPath = inputPath.replace(/\.webm$/, '.wav');
    
    console.log('[Audio Converter] Converting WebM to WAV...');
    
    // Use ffmpeg to convert WebM to WAV
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,           // Input file
      '-ar', '16000',            // Sample rate: 16kHz (optimal for Whisper)
      '-ac', '1',                // Mono channel
      '-c:a', 'pcm_s16le',      // PCM 16-bit little-endian codec
      '-y',                      // Overwrite output file
      outputPath
    ]);
    
    let stderr = '';
    
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        console.error('[Audio Converter] ffmpeg stderr:', stderr);
        reject(new Error('Audio conversion failed. Ensure ffmpeg is installed.'));
        return;
      }
      
      console.log('[Audio Converter] Conversion successful');
      resolve(outputPath);
    });
    
    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to start ffmpeg: ${err.message}. Please install ffmpeg.`));
    });
  });
}

/**
 * Transcribe audio using local Python Whisper (fallback)
 * @param {string} audioPath - Path to audio file
 * @returns {Promise<string>} - Transcribed text
 */
async function transcribeWithPythonWhisper(audioPath) {
  const { spawn } = await import('child_process');
  let convertedPath = null;
  
  return new Promise(async (resolve, reject) => {
    try {
      console.log('[Python Whisper] Starting local transcription...');
      
      // Convert WebM to WAV for better compatibility
      try {
        convertedPath = await convertWebMToWav(audioPath);
        console.log('[Python Whisper] Using converted WAV file:', convertedPath);
      } catch (conversionError) {
        console.warn('[Python Whisper] Conversion failed, trying with original file:', conversionError.message);
        convertedPath = audioPath; // Fall back to original file
      }
      
      // Use the existing transcribe.py script
      const PYTHON_SCRIPT_PATH = path.join(__dirname, '..', 'pythonScripts', 'transcribe.py');
      
      const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
      const python = spawn(pythonCommand, [
        PYTHON_SCRIPT_PATH,
        convertedPath,
        '--no-write',
        '--no-realtime'
      ]);
      
      let stdout = '';
      let stderr = '';
      
      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      python.on('close', async (code) => {
        // Cleanup temp files
        await fs.unlink(audioPath).catch(() => {});
        if (convertedPath && convertedPath !== audioPath) {
          await fs.unlink(convertedPath).catch(() => {});
        }
        
        if (code !== 0) {
          console.error('[Python Whisper] stderr:', stderr);
          
          // Provide helpful error message
          if (stderr.includes('opus') || stderr.includes('codec')) {
            reject(new Error('Audio format issue. Please ensure ffmpeg is installed for audio conversion.'));
          } else if (stderr.includes('No audio') || stderr.includes('empty')) {
            reject(new Error('Could not understand audio. Please speak more clearly and ensure microphone is working.'));
          } else {
            reject(new Error('Transcription failed. This feature requires OpenAI Whisper API access. Please enable it at https://platform.openai.com/settings/organization/billing'));
          }
          return;
        }
        
        try {
          // Parse transcript from output
          const transcriptMatch = stdout.match(/TRANSCRIPT\n-{60}\n\n([\s\S]+?)\n-{60}/);
          
          if (transcriptMatch && transcriptMatch[1]) {
            const transcript = transcriptMatch[1].trim();
            console.log('[Python Whisper] Transcription successful');
            resolve(transcript);
          } else {
            // Try to extract any text from stdout
            const cleaned = stdout.trim();
            if (cleaned && cleaned.length > 10) {
              console.log('[Python Whisper] Using full output as transcript');
              resolve(cleaned);
            } else {
              reject(new Error('No transcript content generated. Audio may be too short or unclear.'));
            }
          }
        } catch (parseError) {
          reject(new Error(`Failed to parse transcript: ${parseError.message}`));
        }
      });
      
      python.on('error', async (err) => {
        await fs.unlink(audioPath).catch(() => {});
        if (convertedPath && convertedPath !== audioPath) {
          await fs.unlink(convertedPath).catch(() => {});
        }
        reject(new Error(`Failed to start Python. Ensure Python and whisper package are installed: ${err.message}`));
      });
      
      // Timeout is handled by OpenAI client configuration (30 minutes)
      // This allows for long-running transcriptions while preventing indefinite hangs
      
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate AI response using OpenAI Responses API (v1/responses)
 * Benefits: 40-80% better cache utilization, stateful conversations, reduced latency
 * @param {string} question - User's question
 * @param {Object} context - Lecture context from chatContextService
 * @param {string} userId - User ID
 * @param {boolean} isTextMode - If true, allow longer responses
 * @returns {Promise<string>} - AI response text
 */
async function generateComprehensionResponse(question, context, userId, isTextMode = false) {
  try {
    console.log('[Responses API] Generating comprehension response...');
    
    // Debug: Log context structure
    console.log('[Responses API] Context type:', context.type);
    console.log('[Responses API] Context has class:', !!context.data?.class);
    console.log('[Responses API] Context has lectures:', context.data?.lectures?.length || 0);
    if (context.data?.lectures?.length > 0) {
      context.data.lectures.forEach((l, i) => {
        console.log(`[Responses API] Lecture ${i + 1}: "${l.title}" - Transcript: ${l.transcript?.text?.length || 0} chars, Notes: ${l.notes?.overview?.length || 0} chars`);
      });
    }

    // Build enhanced system prompt for comprehension assessment
    const systemPrompt = buildComprehensionSystemPrompt(context);
    
    // Log prompt length for debugging
    console.log('[Responses API] System prompt length:', systemPrompt.length, 'chars');

    // Use OpenAI Responses API for comprehension Q&A
    // gpt-4o-mini specs: 128K context, 16K max output
    const response = await responsesService.createResponse({
      input: question,
      instructions: systemPrompt,
      temperature: 0.7,
      maxOutputTokens: isTextMode ? 2000 : 500, // Text: detailed responses, Audio: concise for TTS
      userId,
      service: 'comprehension-qa'
    });

    const responseText = response.text;
    
    if (!responseText) {
      throw new Error('OpenAI Responses API returned empty response');
    }

    console.log('[Responses API] Response generated successfully');
    return responseText.trim();

  } catch (error) {
    console.error('[Responses API] Response generation error:', error);
    throw new Error(`AI response generation failed: ${error.message}`);
  }
}

/**
 * Convert text to speech using OpenAI TTS API with Python gTTS fallback
 * @param {string} text - Text to convert
 * @returns {Promise<Buffer>} - Audio buffer
 */
async function convertTextToSpeech(text, userId) {
  try {
    console.log('[TTS] Calling OpenAI Text-to-Speech API...');

    try {
      // Try OpenAI TTS API first
      const mp3Response = await openai.audio.speech.create({
        model: "tts-1",
        voice: "nova",
        input: text,
        response_format: "mp3",
        speed: 1.0
      });

      // Convert response to buffer
      const audioBuffer = Buffer.from(await mp3Response.arrayBuffer());
      // Usage logging (non-blocking)
      try {
        await recordTTSUsage({
          userId,
          service: 'comprehension-tts',
          model: 'tts-1',
          characters: text?.length || 0,
          metadata: { voice: 'nova' }
        });
      } catch (logErr) {
        console.warn('[TTS] Usage logging failed:', logErr?.message);
      }
      
      console.log('[TTS] OpenAI TTS successful');
      return audioBuffer;

    } catch (apiError) {
      // Check if it's a permission/access error
      const isAccessError = apiError.status === 403 || 
                           apiError.code === 'model_not_found' ||
                           apiError.message?.includes('does not have access');

      if (isAccessError) {
        console.warn('[TTS] OpenAI TTS access denied, trying Python gTTS fallback...');
        
        // Fall back to Python gTTS
        return await convertTextToSpeechPython(text);
      }
      
      // For other errors, rethrow
      throw apiError;
    }

  } catch (error) {
    console.error('[TTS] Text-to-speech error:', error);
    throw new Error(`Text-to-speech conversion failed: ${error.message}`);
  }
}

/**
 * Convert text to speech using Python gTTS (fallback)
 * @param {string} text - Text to convert
 * @returns {Promise<Buffer>} - Audio buffer (MP3)
 */
async function convertTextToSpeechPython(text) {
  const { spawn } = await import('child_process');
  
  return new Promise(async (resolve, reject) => {
    try {
      console.log('[Python TTS] Starting text-to-speech conversion...');
      
      // Ensure temp directory exists
      await fs.mkdir(TEMP_DIR, { recursive: true });
      
      // Save text to temp file
      const textFileName = `tts_text_${Date.now()}.txt`;
      const textFilePath = path.join(TEMP_DIR, textFileName);
      await fs.writeFile(textFilePath, text, 'utf-8');
      
      // Output audio file
      const audioFileName = `tts_audio_${Date.now()}.mp3`;
      const audioFilePath = path.join(TEMP_DIR, audioFileName);
      
      const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
      
      // Use Python gTTS library
      const python = spawn(pythonCommand, [
        '-c',
        `
from gtts import gTTS
import sys

# Read text from file
with open('${textFilePath.replace(/\\/g, '\\\\')}', 'r', encoding='utf-8') as f:
    text = f.read()

# Generate speech
tts = gTTS(text=text, lang='en', slow=False)
tts.save('${audioFilePath.replace(/\\/g, '\\\\')}')

print('TTS generation complete')
        `.trim()
      ]);
      
      let stdout = '';
      let stderr = '';
      
      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      python.on('close', async (code) => {
        // Cleanup text file
        await fs.unlink(textFilePath).catch(() => {});
        
        if (code !== 0) {
          console.error('[Python TTS] stderr:', stderr);
          
          // Cleanup audio file if exists
          await fs.unlink(audioFilePath).catch(() => {});
          
          // Provide helpful error message
          if (stderr.includes('gTTS') || stderr.includes('ModuleNotFoundError')) {
            reject(new Error('Python gTTS not installed. Please run: pip install gTTS'));
          } else {
            reject(new Error('Python TTS failed. OpenAI TTS API access required. Enable at https://platform.openai.com/settings/organization/billing'));
          }
          return;
        }
        
        try {
          // Read generated audio file
          const audioBuffer = await fs.readFile(audioFilePath);
          
          // Cleanup audio file
          await fs.unlink(audioFilePath).catch(() => {});
          
          console.log('[Python TTS] Text-to-speech successful');
          resolve(audioBuffer);
          
        } catch (readError) {
          console.error('[Python TTS] Failed to read audio file:', readError);
          await fs.unlink(audioFilePath).catch(() => {});
          reject(new Error('Failed to read generated audio file'));
        }
      });
      
      python.on('error', async (err) => {
        await fs.unlink(textFilePath).catch(() => {});
        await fs.unlink(audioFilePath).catch(() => {});
        reject(new Error(`Failed to start Python TTS: ${err.message}. Ensure Python is installed.`));
      });
      
      // Timeout for TTS generation (30 seconds)
      setTimeout(() => {
        python.kill();
        fs.unlink(textFilePath).catch(() => {});
        fs.unlink(audioFilePath).catch(() => {});
        reject(new Error('Python TTS timeout (30 seconds)'));
      }, 30000);
      
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Build system prompt for comprehension assessment
 * Uses ONLY lecture notes (summaries) for context - no transcripts
 * Leverages full gpt-4o-mini context window (128K tokens)
 */
function buildComprehensionSystemPrompt(contextData) {
  const data = contextData.data;
  const isMultipleLectures = contextData.type === 'multiple-lectures';
  const lectureCount = data.lectures?.length || 1;
  
  let prompt = `You are Kora, an AI tutor conducting a comprehension assessment for a student. You are evaluating their understanding of the lecture content through Q&A.

**Current Context:**
- **Class**: ${data.class?.name || 'Unknown'}${data.class?.term ? ` (${data.class.term})` : ''}
- **Instructor**: ${data.class?.instructor || 'N/A'}
- **Number of Lectures**: ${lectureCount}
`;

  // Handle multiple lectures context
  if (isMultipleLectures && data.lectures?.length > 0) {
    // List all lecture titles
    prompt += `\n**LECTURES COVERED:**\n`;
    data.lectures.forEach((lecture, idx) => {
      prompt += `${idx + 1}. "${lecture.title}"\n`;
    });
    
    // Include FULL notes for each lecture (no truncation - using full context window)
    prompt += `\n**COMPLETE LECTURE NOTES:**\n`;
    
    data.lectures.forEach((lecture, idx) => {
      prompt += `\n${'='.repeat(60)}\n`;
      prompt += `LECTURE ${idx + 1}: "${lecture.title}"\n`;
      prompt += `${'='.repeat(60)}\n\n`;
      
      // Include FULL notes - no truncation
      if (lecture.notes?.overview) {
        prompt += lecture.notes.overview;
        prompt += '\n';
      } else {
        prompt += '[No notes available for this lecture]\n';
      }
    });
  } 
  // Handle single lecture context
  else if (data.lecture || data.notes) {
    const lectureTitle = data.lecture?.title || 'Selected Lecture';
    prompt += `\n**LECTURE:** "${lectureTitle}"\n`;
    
    // Include FULL notes - no truncation
    if (data.notes?.overview) {
      prompt += `\n**COMPLETE LECTURE NOTES:**\n`;
      prompt += data.notes.overview;
      prompt += '\n';
    }
  }

  prompt += `
${'='.repeat(60)}
KORA — CONVERSATIONAL TUTOR (DEFAULT: TEXTING STYLE)
${'='.repeat(60)}

You are Kora, a friendly tutor chatting with a student about ${lectureCount > 1 ? `these ${lectureCount} lectures` : 'this lecture'}${data.lecture?.title ? `: "${data.lecture.title}"` : data.lectures?.length > 0 ? `: ${data.lectures.map(l => `"${l.title}"`).join(', ')}` : ''}.

Your job is to help the student understand the lecture content in a natural, human, texting-style conversation.

CONVERSATION STYLE (STRICT):
- Write in short, flowing paragraphs like a helpful tutor in chat.
- Sound natural, warm, and supportive.
- Keep the default answer concise (about 2–6 short paragraphs) unless the student asks for more depth.

FORMATTING RULES (VERY IMPORTANT):
- DO NOT use bullet points, numbered lists, headings, tables, or nested lists by default.
- DO NOT use markdown formatting symbols like asterisks (** for bold, * for italic), underscores, or any markdown syntax.
- Write in plain text only - no formatting symbols, no bold, no italic, no structured lists.
- DO NOT format responses like lecture notes or study guides.
- ONLY use structured formatting (bullets/headers/tables) if the student explicitly asks for it, e.g.:
  "Give me bullet points", "List key points", "Make a summary", "Provide key takeaways", "Outline this", "Make a table".

SCOPE & ACCURACY (STRICT):
- Only use information from the ${lectureCount} lecture${lectureCount > 1 ? 's' : ''} provided above.
- If the answer is not in the provided lecture content, say so clearly (e.g., "I don't see that in this lecture's content") and ask the student to share the relevant part or clarify.
- Never invent facts, quotes, or examples that are not present in the lecture.
- If a topic spans multiple lectures, naturally weave information together.
- Mention which lecture something comes from when relevant, but do it conversationally.

BEHAVIOR:
- If the student is confused, explain the same idea in a simpler way, then optionally ask one quick check-in question like: "Does that click?" or "Want a quick example?"

COMPREHENSION ASSESSMENT MODE (when applicable):
- If the user's prompt indicates they are taking an assessment/quiz, answer conversationally first.
- You may ask ONE short follow-up question to confirm understanding, unless the user asked for "just the answer".

READY:
Start the conversation naturally and invite the student's question about ${lectureCount > 1 ? 'these lectures' : 'this lecture'}.
`;

  return prompt;
}

/**
 * Process text question and generate text response
 * Simplified pipeline for text-based comprehension
 * 
 * @param {string} questionText - User's text question
 * @param {string} userId - User ID for context
 * @param {string} classId - Class ID
 * @param {Array<string>} lectureIds - Array of lecture IDs
 * @param {boolean} includeAudio - Whether to generate TTS audio for the response
 * @returns {Promise<{text: string, audioBuffer?: Buffer}>} - Response object
 */
export async function processComprehensionText(questionText, userId, classId, lectureIds, includeAudio = false) {
  console.log('[Comprehension Service] Starting text processing pipeline...');
  console.log(`[Comprehension Service] Processing for ${lectureIds.length} lectures`);
  console.log(`[Comprehension Service] Include audio: ${includeAudio}`);
  
  try {
    if (!questionText || questionText.trim().length === 0) {
      throw new Error('Question text is required');
    }

    // ========== STEP 1: FETCH MULTIPLE LECTURES CONTEXT ==========
    console.log('[Comprehension Service] Step 1: Fetching context for multiple lectures...');
    const context = await chatContextService.fetchMultipleLecturesContext(
      userId,
      lectureIds,
      classId
    );
    console.log('[Comprehension Service] Context fetched successfully');

    // ========== STEP 2: GENERATE AI RESPONSE ==========
    console.log('[Comprehension Service] Step 2: Generating AI response...');
    const responseText = await generateComprehensionResponse(
      questionText.trim(),
      context,
      userId,
      true // isTextMode = true for longer responses
    );
    console.log(`[Comprehension Service] Generated response: "${responseText.substring(0, 100)}..."`);

    // ========== STEP 3: OPTIONALLY CONVERT TO SPEECH ==========
    let audioBuffer = null;
    if (includeAudio) {
      console.log('[Comprehension Service] Step 3: Converting response to speech...');
      audioBuffer = await convertTextToSpeech(responseText, userId);
      console.log(`[Comprehension Service] Generated audio: ${audioBuffer.length} bytes`);
    }

    return {
      text: responseText,
      audioBuffer
    };

  } catch (error) {
    console.error('[Comprehension Service] Text pipeline error:', error);
    throw error;
  }
}

export default {
  processComprehensionAudio,
  processComprehensionText,
  transcribeAudioWithWhisper,
  generateComprehensionResponse,
  convertTextToSpeech
};

