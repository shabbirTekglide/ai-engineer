import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import TranscriptionApi from "../../api/transcriptionApi.js";

// Async thunks for transcription operations
export const getTranscriptionStatus = createAsyncThunk(
  'transcription/getTranscriptionStatus',
  async (lectureId, { rejectWithValue }) => {
    try {
      const response = await TranscriptionApi.getTranscriptionStatus(lectureId);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || error.message || 'Failed to get transcription status'
      );
    }
  }
);

export const getTranscriptionProgress = createAsyncThunk(
  'transcription/getTranscriptionProgress',
  async (lectureId, { rejectWithValue }) => {
    try {
      const response = await TranscriptionApi.getTranscriptionProgress(lectureId);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || error.message || 'Failed to get transcription progress'
      );
    }
  }
);

export const retryTranscription = createAsyncThunk(
  'transcription/retryTranscription',
  async (lectureId, { rejectWithValue }) => {
    try {
      const response = await TranscriptionApi.retryTranscription(lectureId);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || error.message || 'Failed to retry transcription'
      );
    }
  }
);

export const cancelTranscription = createAsyncThunk(
  'transcription/cancelTranscription',
  async (lectureId, { rejectWithValue }) => {
    try {
      const response = await TranscriptionApi.cancelTranscription(lectureId);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || error.message || 'Failed to cancel transcription'
      );
    }
  }
);

const transcriptionSlice = createSlice({
  name: "transcription",
  initialState: {
    // Status tracking for multiple lectures
    statuses: {}, // { lectureId: { status, progress, error } }
    // Real-time progress tracking
    progressUpdates: {}, // { lectureId: progressData }
    // SSE connections
    connections: {}, // { lectureId: EventSource }
    // Global state
    isLoading: false,
    error: null,
  },
  reducers: {
    clearTranscriptionError: (state) => {
      state.error = null;
    },
    clearLectureTranscription: (state, action) => {
      const lectureId = action.payload;
      delete state.statuses[lectureId];
      delete state.progressUpdates[lectureId];
      // Close SSE connection if exists
      if (state.connections[lectureId]) {
        state.connections[lectureId].close();
        delete state.connections[lectureId];
      }
    },
    updateTranscriptionProgress: (state, action) => {
      const { lectureId, progress } = action.payload;
      state.progressUpdates[lectureId] = progress;
    },
    startProgressSubscription: (state, action) => {
      const { lectureId, eventSource } = action.payload;
      state.connections[lectureId] = eventSource;
    },
    stopProgressSubscription: (state, action) => {
      const lectureId = action.payload;
      if (state.connections[lectureId]) {
        state.connections[lectureId].close();
        delete state.connections[lectureId];
      }
    },
    setTranscriptionStatus: (state, action) => {
      const { lectureId, status, progress, error } = action.payload;
      state.statuses[lectureId] = { status, progress, error };
    },
  },
  extraReducers: (builder) => {
    // Get Transcription Status
    builder
      .addCase(getTranscriptionStatus.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getTranscriptionStatus.fulfilled, (state, action) => {
        state.isLoading = false;
        const { lectureId, status, progress } = action.payload.data;
        state.statuses[lectureId] = { status, progress, error: null };
        state.error = null;
      })
      .addCase(getTranscriptionStatus.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      });

    // Get Transcription Progress
    builder
      .addCase(getTranscriptionProgress.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getTranscriptionProgress.fulfilled, (state, action) => {
        state.isLoading = false;
        const { lectureId, progress } = action.payload.data;
        state.progressUpdates[lectureId] = progress;
        state.error = null;
      })
      .addCase(getTranscriptionProgress.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      });

    // Retry Transcription
    builder
      .addCase(retryTranscription.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(retryTranscription.fulfilled, (state, action) => {
        state.isLoading = false;
        const { lectureId, status } = action.payload.data;
        state.statuses[lectureId] = { status, progress: 0, error: null };
        state.error = null;
      })
      .addCase(retryTranscription.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      });

    // Cancel Transcription
    builder
      .addCase(cancelTranscription.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(cancelTranscription.fulfilled, (state, action) => {
        state.isLoading = false;
        const { lectureId } = action.payload.data;
        state.statuses[lectureId] = { status: 'cancelled', progress: 0, error: null };
        // Close SSE connection
        if (state.connections[lectureId]) {
          state.connections[lectureId].close();
          delete state.connections[lectureId];
        }
        state.error = null;
      })
      .addCase(cancelTranscription.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      });
  },
});

export const { 
  clearTranscriptionError,
  clearLectureTranscription,
  updateTranscriptionProgress,
  startProgressSubscription,
  stopProgressSubscription,
  setTranscriptionStatus
} = transcriptionSlice.actions;

export default transcriptionSlice.reducer;
