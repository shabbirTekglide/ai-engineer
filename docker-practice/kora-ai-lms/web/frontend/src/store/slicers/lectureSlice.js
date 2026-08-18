import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import LectureApi from "../../api/lectureApi.js";
const initialState = {
  lectures: [],
  currentLecture: {},
  loading: false,
  error: null,
  // Tracks whether any lectures are still being processed
  hasActiveProcessing: false,
  pagination: {
    totalLectures: 0,
    totalPages: 0,
    currentPage: 1,
    limit: 10,
  },
};

export const createLecture = createAsyncThunk(
  "lecture/createLecture",
  async ({ classId, formData }, { rejectWithValue, dispatch }) => {
    try {
      const response = await LectureApi.createLecture({ classId, formData });
      console.log("Full API response:", response);

      const data = response.data || response;

      // If processing job was created, add it to queue state
      if (data.processingJob) {
        // Dynamically import to avoid circular dependency
        const { addJob } = await import("./queueSlice.js");
        dispatch(addJob(data.processingJob));
      }

      return data;
    } catch (error) {
      console.error("API Error:", error);
      return rejectWithValue(
        error.response?.data?.message ||
          error.message ||
          "Failed to create lecture",
      );
    }
  },
);

export const reprocessLecture = createAsyncThunk(
  "lecture/reprocessLecture",
  async ({ lectureId }, { rejectWithValue, dispatch }) => {
    try {
      const response = await LectureApi.reprocessLecture({ lectureId });
      console.log("Full API response:", response);

      const data = response.data || response;

      // If processing job was created, add it to queue state
      if (data.processingJob) {
        // Dynamically import to avoid circular dependency
        const { addJob } = await import("./queueSlice.js");
        dispatch(addJob(data.processingJob));
      }

      return data;
    } catch (error) {
      console.error("API Error:", error);
      return rejectWithValue(
        error.response?.data?.message ||
          error.message ||
          "Failed to create lecture",
      );
    }
  },
);

export const deleteLecture = createAsyncThunk(
  "lecture/deleteLecture",
  async ({ lectureId }, { rejectWithValue }) => {
    try {
      const response = await LectureApi.deleteLecture({ lectureId });
      console.log("Full API response:", response);

      const data = response.data || response;
      return data;
    } catch (error) {
      console.error("API Error:", error);
      return rejectWithValue(
        error.response?.data?.message ||
          error.message ||
          "Failed to create lecture",
      );
    }
  },
);
export const getAllLectures = createAsyncThunk(
  "lecture/getAllLectures",
  async (
    { classId, page = 1, limit = 5, status = "all" },
    { rejectWithValue },
  ) => {
    try {
      if (!classId) {
        return rejectWithValue("classId is required");
      }

      const response = await LectureApi.getAllLectures(
        classId,
        page,
        limit,
        status,
      );
      console.log("Full API response:", response);
      if (response.data) {
        return response.data;
      }

      // If response is already the data
      return response;
    } catch (error) {
      console.error("API Error:", error);
      return rejectWithValue(
        error.response?.data?.message ||
          error.message ||
          "Failed to fetch lectures",
      );
    }
  },
);

/**
 * Poll statuses for all non-terminal lectures in a single batch request.
 * Returns the status map so the reducer can update individual lectures.
 */
export const pollLectureStatuses = createAsyncThunk(
  "lecture/pollLectureStatuses",
  async (lectureIds, { rejectWithValue }) => {
    try {
      if (!lectureIds || lectureIds.length === 0) return { statuses: {} };
      const response = await LectureApi.batchStatus(lectureIds);
      return response.data;
    } catch (error) {
      // Don't treat network blips as failures — just return empty so polling continues
      console.warn("[Polling] batch-status error:", error.message);
      return rejectWithValue("polling_error");
    }
  },
);

export const getCurrentLecture = createAsyncThunk(
  "lecture/getCurrentLecture",
  async (lectureId, { rejectWithValue }) => {
    try {
      const response = await LectureApi.getCurrentLecture(lectureId);
      console.log("Full API response:", response);
      if (response.data) {
        return response.data;
      }

      // If response is already the data
      return response;
    } catch (error) {
      console.error("API Error:", error);
      return rejectWithValue(
        error.response?.data?.message ||
          error.message ||
          "Failed to create lecture",
      );
    }
  },
);

export const uploadDocument = createAsyncThunk(
  "lecture/uploadDoc",
  async ({ classId, formData }, { rejectWithValue }) => {
    try {
      const response = await LectureApi.uploadDoc({ classId, formData });
      console.log(response, "from upload doc slice");
      return response.data;
    } catch (error) {
      console.error("API Error:", error);
      return rejectWithValue(
        error.response?.data?.message ||
          error.message ||
          "Failed to upload document",
      );
    }
  },
);

const lectureSlice = createSlice({
  name: "lecture",
  initialState,
  reducers: {
    clearCurrentLecture: (state) => {
      state.currentLecture = {};
    },
    clearError: (state) => {
      state.error = null;
    },
    clearLectures: (state) => {
      state.lectures = [];
      state.hasActiveProcessing = false;
      state.pagination = {
        totalLectures: 0,
        totalPages: 0,
        currentPage: 1,
        limit: 10,
      };
    },
    /**
     * Batch-update processing statuses for lectures.
     * Payload: { [lectureId]: { processingStatus, processingError } }
     */
    updateLectureStatuses: (state, action) => {
      const statusMap = action.payload;
      let hasActive = false;
      state.lectures = state.lectures.map((lecture) => {
        const update = statusMap[lecture._id];
        if (update) {
          const updated = {
            ...lecture,
            processingStatus: update.processingStatus,
            processingError: update.processingError,
            overallProgress: update.overallProgress,
          };
          if (
            update.processingStatus === "pending" ||
            update.processingStatus === "processing"
          ) {
            hasActive = true;
          }
          return updated;
        }
        if (
          lecture.processingStatus === "pending" ||
          lecture.processingStatus === "processing"
        ) {
          hasActive = true;
        }
        return lecture;
      });
      state.hasActiveProcessing = hasActive;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(createLecture.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createLecture.fulfilled, (state, action) => {
        state.loading = false;
        console.log("Fulfilled payload:", action.payload);

        // Handle different possible response structures
        if (action.payload.lecture) {
          state.lectures.push(action.payload.lecture);
          // New lecture starts as pending — enable polling
          state.hasActiveProcessing = true;
        }
      })
      .addCase(createLecture.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        console.error("Rejected error:", action.error);
      })
      .addCase(reprocessLecture.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(reprocessLecture.fulfilled, (state, action) => {
        state.loading = false;
        console.log("Fulfilled payload:", action.payload);

        // Handle different possible response structures
        if (action.payload.lecture) {
          state.lectures = state.lectures.map((lecture) =>
            lecture._id === action.payload.lecture._id
              ? action.payload.lecture
              : lecture,
          );
          // Mark active processing since reprocess sets status to pending
          state.hasActiveProcessing = true;
        }
      })
      .addCase(reprocessLecture.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        console.error("Rejected error:", action.error);
      })
      .addCase(deleteLecture.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteLecture.fulfilled, (state, action) => {
        state.loading = false;
        console.log("Fulfilled payload:", action.payload);
        console.log("Meta:", action.meta);
        state.lectures = state.lectures.filter(
          (lecture) => lecture._id !== action.meta.arg.lectureId,
        );
      })
      .addCase(deleteLecture.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        console.error("Rejected error:", action.error);
      })
      .addCase(getAllLectures.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getAllLectures.fulfilled, (state, action) => {
        state.loading = false;
        state.lectures = action.payload.lectures;
        state.pagination = action.payload.pagination || state.pagination;
        state.hasActiveProcessing = (action.payload.lectures || []).some(
          (l) =>
            l.processingStatus === "pending" ||
            l.processingStatus === "processing",
        );
      })
      .addCase(getAllLectures.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        console.error("Rejected error:", action.error);
      })
      .addCase(getCurrentLecture.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getCurrentLecture.fulfilled, (state, action) => {
        state.loading = false;
        state.currentLecture = action.payload.lecture;
      })
      .addCase(getCurrentLecture.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        console.error("Rejected error:", action.error);
      })
      // Poll lecture statuses — update in-place without triggering loading state
      .addCase(pollLectureStatuses.fulfilled, (state, action) => {
        const statusMap = action.payload?.statuses;
        if (!statusMap) return;
        let hasActive = false;
        state.lectures = state.lectures.map((lecture) => {
          const update = statusMap[lecture._id];
          if (update) {
            if (
              update.processingStatus === "pending" ||
              update.processingStatus === "processing"
            ) {
              hasActive = true;
            }
            return {
              ...lecture,
              processingStatus: update.processingStatus,
              processingError: update.processingError,
              overallProgress: update.overallProgress,
            };
          }
          if (
            lecture.processingStatus === "pending" ||
            lecture.processingStatus === "processing"
          ) {
            hasActive = true;
          }
          return lecture;
        });
        state.hasActiveProcessing = hasActive;
      })

      // Upload Doc
      .addCase(uploadDocument.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(uploadDocument.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.lecture) {
          state.lectures.push(action.payload.lecture);
          state.hasActiveProcessing = true;
        }
      });
  },
});

export const {
  clearCurrentLecture,
  clearError,
  clearLectures,
  updateLectureStatuses,
} = lectureSlice.actions;
export default lectureSlice.reducer;
