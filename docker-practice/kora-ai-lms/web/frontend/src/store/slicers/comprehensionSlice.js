// store/slicers/comprehensionSlice.js
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import ComprehensionApi from "../../api/comprehensionApi.js";

const initialState = {
  isRecording: false,
  isProcessing: false,
  isPlayingResponse: false,
  currentAudioBlob: null,
  responseAudioBlob: null,
  // Text-based response support
  responseText: null,
  responseAudioBase64: null,
  error: null,
  successMessage: null,
};

/**
 * Async thunk for text-based comprehension (primary mode)
 */
export const assessComprehensionText = createAsyncThunk(
  "comprehension/assessText",
  async ({ classId, lectureIds, documentIds, question, includeAudio = false }, { rejectWithValue }) => {
    try {
      let newLectureIds = [...new Set([...lectureIds, ...documentIds])];
      console.log("newLectureIds", newLectureIds);
      const response = await ComprehensionApi.assessComprehensionText(
        classId,
        newLectureIds,
        question,
        includeAudio
      );
      return response; // { text, audio?, audioFormat? }
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

/**
 * Async thunk for audio-based comprehension (optional speaking mode)
 */
export const assessComprehensionAudio = createAsyncThunk(
  "comprehension/assessAudio",
  async ({ classId, lectureIds, documentIds, audioBlob }, { rejectWithValue }) => {
    try {
      let newLectureIds = [...new Set([...lectureIds, ...documentIds])];
      console.log("newLectureIds", newLectureIds);
      const responseBlob = await ComprehensionApi.assessComprehensionAudio(
        classId,
        newLectureIds,
        audioBlob
      );
      return responseBlob;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const comprehensionSlice = createSlice({
  name: "comprehension",
  initialState,
  reducers: {
    setRecording(state, action) {
      state.isRecording = action.payload;
    },
    setCurrentAudioBlob(state, action) {
      state.currentAudioBlob = action.payload;
    },
    setPlayingResponse(state, action) {
      state.isPlayingResponse = action.payload;
    },
    clearError(state) {
      state.error = null;
    },
    clearSuccess(state) {
      state.successMessage = null;
    },
    resetComprehension(state) {
      state.isRecording = false;
      state.isProcessing = false;
      state.isPlayingResponse = false;
      state.currentAudioBlob = null;
      state.responseAudioBlob = null;
      state.responseText = null;
      state.responseAudioBase64 = null;
      state.error = null;
      state.successMessage = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Text-based assessment (primary)
      .addCase(assessComprehensionText.pending, (state) => {
        state.isProcessing = true;
        state.error = null;
        state.responseText = null;
        state.responseAudioBase64 = null;
      })
      .addCase(assessComprehensionText.fulfilled, (state, action) => {
        state.isProcessing = false;
        state.responseText = action.payload.text;
        state.responseAudioBase64 = action.payload.audio || null;
        state.successMessage = "Response received!";
      })
      .addCase(assessComprehensionText.rejected, (state, action) => {
        state.isProcessing = false;
        state.error = action.payload || "Failed to process question";
        state.responseText = null;
        state.responseAudioBase64 = null;
      })
      // Audio-based assessment (optional speaking mode)
      .addCase(assessComprehensionAudio.pending, (state) => {
        state.isProcessing = true;
        state.error = null;
        state.responseAudioBlob = null;
      })
      .addCase(assessComprehensionAudio.fulfilled, (state, action) => {
        state.isProcessing = false;
        state.responseAudioBlob = action.payload;
        state.successMessage = "Response received! Click play to listen.";
      })
      .addCase(assessComprehensionAudio.rejected, (state, action) => {
        state.isProcessing = false;
        state.error = action.payload || "Failed to process question";
        state.responseAudioBlob = null;
      });
  },
});

export const {
  setRecording,
  setCurrentAudioBlob,
  setPlayingResponse,
  clearError,
  clearSuccess,
  resetComprehension,
} = comprehensionSlice.actions;

export default comprehensionSlice.reducer;

