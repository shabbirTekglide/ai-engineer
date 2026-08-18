import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import QueueApi from '../../api/queueApi';

/**
 * Queue Slice
 * ===========
 * 
 * Redux state management for processing queue
 * Handles job tracking, progress updates, and queue operations
 */

// Async thunks

/**
 * Fetch all jobs for the user
 */
export const fetchUserJobs = createAsyncThunk(
  'queue/fetchUserJobs',
  async (params = {}, { rejectWithValue }) => {
    try {
      const response = await QueueApi.getUserJobs(params);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch jobs'
      );
    }
  }
);

/**
 * Fetch specific job by ID
 */
export const fetchJobById = createAsyncThunk(
  'queue/fetchJobById',
  async (jobId, { rejectWithValue }) => {
    try {
      const response = await QueueApi.getJobById(jobId);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch job'
      );
    }
  }
);

/**
 * Fetch job by lecture ID
 */
export const fetchJobByLectureId = createAsyncThunk(
  'queue/fetchJobByLectureId',
  async (lectureId, { rejectWithValue }) => {
    try {
      const response = await QueueApi.getJobByLectureId(lectureId);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch job'
      );
    }
  }
);

/**
 * Retry a failed job
 */
export const retryJob = createAsyncThunk(
  'queue/retryJob',
  async (jobId, { rejectWithValue }) => {
    try {
      const response = await QueueApi.retryJob(jobId);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to retry job'
      );
    }
  }
);

/**
 * Cancel a job
 */
export const cancelJob = createAsyncThunk(
  'queue/cancelJob',
  async (jobId, { rejectWithValue }) => {
    try {
      const response = await QueueApi.cancelJob(jobId);
      return { jobId, ...response.data };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to cancel job'
      );
    }
  }
);

/**
 * Fetch queue statistics
 */
export const fetchQueueStats = createAsyncThunk(
  'queue/fetchQueueStats',
  async (_, { rejectWithValue }) => {
    try {
      const response = await QueueApi.getQueueStats();
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || 'Failed to fetch queue stats'
      );
    }
  }
);

// Initial state
const initialState = {
  // Jobs data
  jobs: [],
  activeJobs: [], // Jobs that are queued or processing
  completedJobs: [],
  failedJobs: [],
  
  // Current job being viewed/tracked
  currentJob: null,
  
  // Queue statistics
  stats: {
    queued: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    total: 0
  },
  
  // Progress tracking (keyed by lectureId)
  progressMap: {},
  
  // Loading states
  loading: false,
  jobsLoading: false,
  statsLoading: false,
  
  // Error handling
  error: null,
  
  // SSE connections (keyed by lectureId)
  sseConnections: {}
};

// Slice
const queueSlice = createSlice({
  name: 'queue',
  initialState,
  reducers: {
    /**
     * Update progress for a specific job
     */
    updateJobProgress: (state, action) => {
      const { lectureId, jobId, progress, stage, overallProgress, stages } = action.payload;
      
      // Update progress map
      state.progressMap[lectureId] = {
        jobId,
        lectureId,
        progress,
        stage,
        overallProgress,
        stages,
        lastUpdated: new Date().toISOString()
      };
      
      // Update job in jobs array
      const jobIndex = state.jobs.findIndex(j => j._id === jobId);
      if (jobIndex !== -1) {
        state.jobs[jobIndex] = {
          ...state.jobs[jobIndex],
          currentStage: stage,
          overallProgress,
          stages
        };
      }
      
      // Update current job if it matches
      if (state.currentJob?._id === jobId) {
        state.currentJob = {
          ...state.currentJob,
          currentStage: stage,
          overallProgress,
          stages
        };
      }
    },
    
    /**
     * Mark job as completed
     */
    markJobCompleted: (state, action) => {
      const { jobId, lectureId } = action.payload;
      
      // Update progress map
      if (state.progressMap[lectureId]) {
        state.progressMap[lectureId].status = 'completed';
        state.progressMap[lectureId].overallProgress = 100;
      }
      
      // Update job in jobs array
      const jobIndex = state.jobs.findIndex(j => j._id === jobId);
      if (jobIndex !== -1) {
        state.jobs[jobIndex].status = 'completed';
        state.jobs[jobIndex].overallProgress = 100;
        
        // Move to completed jobs
        state.completedJobs.push(state.jobs[jobIndex]);
        state.activeJobs = state.activeJobs.filter(j => j._id !== jobId);
      }
      
      // Update current job
      if (state.currentJob?._id === jobId) {
        state.currentJob.status = 'completed';
        state.currentJob.overallProgress = 100;
      }
    },
    
    /**
     * Mark job as failed
     */
    markJobFailed: (state, action) => {
      const { jobId, lectureId, error } = action.payload;
      
      // Update progress map
      if (state.progressMap[lectureId]) {
        state.progressMap[lectureId].status = 'failed';
        state.progressMap[lectureId].error = error;
      }
      
      // Update job in jobs array
      const jobIndex = state.jobs.findIndex(j => j._id === jobId);
      if (jobIndex !== -1) {
        state.jobs[jobIndex].status = 'failed';
        state.jobs[jobIndex].error = error;
        
        // Move to failed jobs
        state.failedJobs.push(state.jobs[jobIndex]);
        state.activeJobs = state.activeJobs.filter(j => j._id !== jobId);
      }
      
      // Update current job
      if (state.currentJob?._id === jobId) {
        state.currentJob.status = 'failed';
        state.currentJob.error = error;
      }
    },
    
    /**
     * Add new job to state (after upload)
     */
    addJob: (state, action) => {
      const job = action.payload;
      
      // Add to jobs array if not already present
      if (!state.jobs.find(j => j._id === job._id)) {
        state.jobs.unshift(job);
      }
      
      // Add to active jobs if queued or processing
      if (job.status === 'queued' || job.status === 'processing') {
        if (!state.activeJobs.find(j => j._id === job._id)) {
          state.activeJobs.unshift(job);
        }
      }
    },
    
    /**
     * Remove job from state
     */
    removeJob: (state, action) => {
      const jobId = action.payload;
      state.jobs = state.jobs.filter(j => j._id !== jobId);
      state.activeJobs = state.activeJobs.filter(j => j._id !== jobId);
      state.completedJobs = state.completedJobs.filter(j => j._id !== jobId);
      state.failedJobs = state.failedJobs.filter(j => j._id !== jobId);
      
      if (state.currentJob?._id === jobId) {
        state.currentJob = null;
      }
    },
    
    /**
     * Clear all jobs
     */
    clearJobs: (state) => {
      state.jobs = [];
      state.activeJobs = [];
      state.completedJobs = [];
      state.failedJobs = [];
      state.currentJob = null;
      state.progressMap = {};
    },
    
    /**
     * Clear error
     */
    clearError: (state) => {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    // Fetch user jobs
    builder
      .addCase(fetchUserJobs.pending, (state) => {
        state.jobsLoading = true;
        state.error = null;
      })
      .addCase(fetchUserJobs.fulfilled, (state, action) => {
        state.jobsLoading = false;
        state.jobs = action.payload.jobs || [];
        
        // Categorize jobs
        state.activeJobs = state.jobs.filter(
          j => j.status === 'queued' || j.status === 'processing'
        );
        state.completedJobs = state.jobs.filter(j => j.status === 'completed');
        state.failedJobs = state.jobs.filter(j => j.status === 'failed');
      })
      .addCase(fetchUserJobs.rejected, (state, action) => {
        state.jobsLoading = false;
        state.error = action.payload;
      });
    
    // Fetch job by ID
    builder
      .addCase(fetchJobById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchJobById.fulfilled, (state, action) => {
        state.loading = false;
        state.currentJob = action.payload.job;
      })
      .addCase(fetchJobById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
    
    // Fetch job by lecture ID
    builder
      .addCase(fetchJobByLectureId.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchJobByLectureId.fulfilled, (state, action) => {
        state.loading = false;
        state.currentJob = action.payload.job;
      })
      .addCase(fetchJobByLectureId.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
    
    // Retry job
    builder
      .addCase(retryJob.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(retryJob.fulfilled, (state, action) => {
        state.loading = false;
        const job = action.payload.job;
        
        // Update job in state
        const jobIndex = state.jobs.findIndex(j => j._id === job._id);
        if (jobIndex !== -1) {
          state.jobs[jobIndex] = job;
        }
        
        // Move from failed to active
        state.failedJobs = state.failedJobs.filter(j => j._id !== job._id);
        if (!state.activeJobs.find(j => j._id === job._id)) {
          state.activeJobs.push(job);
        }
      })
      .addCase(retryJob.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
    
    // Cancel job
    builder
      .addCase(cancelJob.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(cancelJob.fulfilled, (state, action) => {
        state.loading = false;
        const { jobId } = action.payload;
        
        // Update job status
        const jobIndex = state.jobs.findIndex(j => j._id === jobId);
        if (jobIndex !== -1) {
          state.jobs[jobIndex].status = 'cancelled';
        }
        
        // Remove from active jobs
        state.activeJobs = state.activeJobs.filter(j => j._id !== jobId);
      })
      .addCase(cancelJob.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
    
    // Fetch queue stats
    builder
      .addCase(fetchQueueStats.pending, (state) => {
        state.statsLoading = true;
      })
      .addCase(fetchQueueStats.fulfilled, (state, action) => {
        state.statsLoading = false;
        state.stats = action.payload.stats;
      })
      .addCase(fetchQueueStats.rejected, (state, action) => {
        state.statsLoading = false;
      });
  }
});

// Export actions
export const {
  updateJobProgress,
  markJobCompleted,
  markJobFailed,
  addJob,
  removeJob,
  clearJobs,
  clearError
} = queueSlice.actions;

// Export selectors
export const selectAllJobs = (state) => state.queue.jobs;
export const selectActiveJobs = (state) => state.queue.activeJobs;
export const selectCompletedJobs = (state) => state.queue.completedJobs;
export const selectFailedJobs = (state) => state.queue.failedJobs;
export const selectCurrentJob = (state) => state.queue.currentJob;
export const selectQueueStats = (state) => state.queue.stats;
export const selectJobsLoading = (state) => state.queue.jobsLoading;
export const selectQueueError = (state) => state.queue.error;
export const selectProgressForLecture = (lectureId) => (state) => 
  state.queue.progressMap[lectureId];

// Export reducer
export default queueSlice.reducer;

