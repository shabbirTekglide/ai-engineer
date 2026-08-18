// api/comprehensionApi.js
import axiosInstance from "../config/axios.js";

/**
 * Robust base64 to Blob conversion using fetch API
 * This method handles large files and special characters better than manual atob() conversion
 * Works reliably in production environments where manual conversion may fail
 * 
 * @param {string} base64 - Base64 encoded string
 * @param {string} mimeType - MIME type of the data (e.g., 'audio/mpeg')
 * @returns {Promise<Blob>} - Blob object
 */
const base64ToBlob = async (base64, mimeType = 'audio/mpeg') => {
  try {
    // Method 1: Use fetch with data URI (most reliable for production)
    const dataUri = `data:${mimeType};base64,${base64}`;
    const response = await fetch(dataUri);
    if (!response.ok) {
      throw new Error('Fetch failed');
    }
    return await response.blob();
  } catch (fetchError) {
    console.warn('[Audio] Fetch method failed, trying manual conversion:', fetchError.message);
    
    // Method 2: Manual conversion with proper error handling (fallback)
    try {
      // Decode base64 - handle potential padding issues
      let cleanBase64 = base64.replace(/\s/g, ''); // Remove whitespace
      
      // Ensure proper padding
      while (cleanBase64.length % 4 !== 0) {
        cleanBase64 += '=';
      }
      
      const binaryString = atob(cleanBase64);
      const bytes = new Uint8Array(binaryString.length);
      
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      return new Blob([bytes], { type: mimeType });
    } catch (manualError) {
      console.error('[Audio] Manual conversion also failed:', manualError);
      throw new Error('Failed to convert audio data. The audio may be corrupted.');
    }
  }
};

/**
 * Convert base64 audio to a playable Blob URL
 * Returns both the blob and the object URL for playback
 * 
 * @param {string} base64Audio - Base64 encoded audio
 * @param {string} format - Audio format (mp3, mpeg, etc.)
 * @returns {Promise<{blob: Blob, url: string}>}
 */
const createAudioBlobUrl = async (base64Audio, format = 'mp3') => {
  const mimeType = format === 'mp3' || format === 'mpeg' ? 'audio/mpeg' : `audio/${format}`;
  const blob = await base64ToBlob(base64Audio, mimeType);
  const url = URL.createObjectURL(blob);
  return { blob, url };
};

const ComprehensionApi = {
  /**
   * Send text question and get text response (with optional audio)
   * @param {string} classId - Class ID
   * @param {Array<string>} lectureIds - Array of Lecture IDs
   * @param {string} question - Text question
   * @param {boolean} includeAudio - Whether to include audio response
   * @returns {Promise<{text: string, audio?: string, audioFormat?: string}>} - Response object
   */
  assessComprehensionText: async (classId, lectureIds, question, includeAudio = false) => {
    try {
      const response = await axiosInstance.post(
        `/api/comprehension/assess-text`,
        {
          classId,
          lectureIds,
          question,
          includeAudio
        },
        {
          timeout: 60000, // 60 second timeout
        }
      );

      return response.data.data; // Returns { text, audio?, audioFormat? }
    } catch (error) {
      // Handle errors gracefully
      if (error.response?.status === 400) {
        throw new Error(error.response.data?.message || 'Invalid request or lectures not ready for assessment');
      } else if (error.response?.status === 404) {
        throw new Error('Lectures not found');
      } else if (error.response?.status === 504) {
        throw new Error('Request timeout. Please try again with a shorter question.');
      } else {
        throw new Error('Failed to process comprehension assessment. Please try again.');
      }
    }
  },

  /**
   * Send audio question and get audio response (speech-to-speech)
   * @param {string} classId - Class ID
   * @param {Array<string>} lectureIds - Array of Lecture IDs
   * @param {Blob} audioBlob - Audio recording blob
   * @returns {Promise<Blob>} - Response audio blob (converted from base64)
   */
  assessComprehensionAudio: async (classId, lectureIds, audioBlob) => {
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'question.webm');
      formData.append('classId', classId);
      formData.append('lectureIds', JSON.stringify(lectureIds));

      console.log('[Comprehension API] Sending audio assessment request...');

      const response = await axiosInstance.post(
        `/api/comprehension/assess`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          timeout: 120000, // 120 second timeout for audio processing
        }
      );

      // Backend returns JSON with base64 audio: { success: true, data: { text, audio, audioFormat } }
      const responseData = response.data.data || response.data;
      
      console.log('[Comprehension API] Response received:', {
        hasAudio: !!responseData.audio,
        audioLength: responseData.audio?.length || 0,
        audioFormat: responseData.audioFormat || 'mp3',
        hasText: !!responseData.text
      });
      
      // Convert base64 audio to blob using robust method
      if (responseData.audio) {
        const audioFormat = responseData.audioFormat || 'mp3';
        const mimeType = audioFormat === 'mp3' || audioFormat === 'mpeg' ? 'audio/mpeg' : `audio/${audioFormat}`;
        
        console.log('[Comprehension API] Converting base64 to blob, mimeType:', mimeType);
        
        const audioResponseBlob = await base64ToBlob(responseData.audio, mimeType);
        
        console.log('[Comprehension API] Blob created:', {
          size: audioResponseBlob.size,
          type: audioResponseBlob.type
        });
        
        return audioResponseBlob;
      }
      
      throw new Error('No audio data in response');
    } catch (error) {
      console.error('[Comprehension API] Audio assessment error:', error);
      
      // Handle errors gracefully
      if (error.response?.status === 400) {
        throw new Error(error.response.data?.message || 'Invalid audio or lectures not ready for assessment');
      } else if (error.response?.status === 404) {
        throw new Error('Lectures not found');
      } else if (error.response?.status === 504) {
        throw new Error('Request timeout. Please try again with a shorter question.');
      } else if (error.message?.includes('Failed to convert audio')) {
        // Re-throw audio conversion errors as-is
        throw error;
      } else {
        throw new Error(error.response?.data?.message || 'Failed to process comprehension assessment. Please try again.');
      }
    }
  },
  
  // Export utility functions for use in components
  base64ToBlob,
  createAudioBlobUrl,
};

export default ComprehensionApi;

