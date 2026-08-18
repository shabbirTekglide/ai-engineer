// store/slicers/chatSlice.js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import ChatApi from '../../api/chatApi.js';

// Async thunks
export const createOrGetThread = createAsyncThunk(
  'chat/createOrGetThread',
  async ({ context, classId, lectureId }, { rejectWithValue }) => {
    try {
      const response = await ChatApi.createOrGetThread({ context, classId, lectureId });
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

export const getUserThreads = createAsyncThunk(
  'chat/getUserThreads',
  async (filters = {}, { rejectWithValue }) => {
    try {
      const response = await ChatApi.getUserThreads(filters);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

export const getThreadById = createAsyncThunk(
  'chat/getThreadById',
  async (threadId, { rejectWithValue }) => {
    try {
      const response = await ChatApi.getThreadById(threadId);
      console.log(response.data, "response from get thread")
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

export const sendMessage = createAsyncThunk(
  'chat/sendMessage',
  async ({ threadId, message }, { rejectWithValue }) => {
    try {
      const response = await ChatApi.sendMessage(threadId, message);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

export const deleteThread = createAsyncThunk(
  'chat/deleteThread',
  async (threadId, { rejectWithValue }) => {
    try {
      const response = await ChatApi.deleteThread(threadId);
      return { ...response.data, threadId };
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

export const clearThread = createAsyncThunk(
  'chat/clearThread',
  async (threadId, { rejectWithValue }) => {
    try {
      const response = await ChatApi.clearThread(threadId);
      return { ...response.data, threadId };
    } catch (error) {
      return rejectWithValue(error.response?.data || error.message);
    }
  }
);

// Initial state
const initialState = {
  // Current context
  currentContext: {
    type: 'general', // 'general' | 'class' | 'lecture'
    classId: null,
    lectureId: null
  },
  
  // Current active thread
  currentThread: null,
  
  // Messages in current thread
  messages: [],
  
  // All threads
  threads: [],
  
  // UI state
  isOpen: false,
  isMinimized: false,
  
  // Loading states
  loading: false,
  sendingMessage: false,
  
  // Error state
  error: null
};

// Slice
const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    // UI actions
    toggleChat: (state) => {
      state.isOpen = !state.isOpen;
      if (state.isOpen) {
        state.isMinimized = false;
      }
    },
    
    openChat: (state) => {
      state.isOpen = true;
      state.isMinimized = false;
    },
    
    closeChat: (state) => {
      state.isOpen = false;
    },
    
    minimizeChat: (state) => {
      state.isMinimized = !state.isMinimized;
    },
    
    // Context management
    setContext: (state, action) => {
      const { type, classId, lectureId } = action.payload;
      state.currentContext = {
        type,
        classId: classId || null,
        lectureId: lectureId || null
      };
      // Reset thread when context changes
      state.currentThread = null;
      state.messages = [];
    },
    
    // Message management
    addOptimisticMessage: (state, action) => {
      state.messages.push({
        role: 'user',
        content: action.payload,
        timestamp: new Date().toISOString(),
        optimistic: true
      });
    },
    
    clearError: (state) => {
      state.error = null;
    },
    
    resetChat: (state) => {
      state.currentThread = null;
      state.messages = [];
      state.error = null;
    }
  },
  
  extraReducers: (builder) => {
    builder
      // Create or get thread
      .addCase(createOrGetThread.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createOrGetThread.fulfilled, (state, action) => {
        state.loading = false;
        state.currentThread = action.payload.thread;
        // Messages are loaded from thread, but the API doesn't return full messages
        // They will be loaded via getThreadById if needed
        state.messages = action.payload.thread.messages || [];
      })
      .addCase(createOrGetThread.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.message || 'Failed to create thread';
      })
      
      // Get user threads
      .addCase(getUserThreads.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getUserThreads.fulfilled, (state, action) => {
        state.loading = false;
        state.threads = action.payload.threads || [];
      })
      .addCase(getUserThreads.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.message || 'Failed to fetch threads';
      })
      
      // Get thread by ID
      .addCase(getThreadById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getThreadById.fulfilled, (state, action) => {
        state.loading = false;
        state.currentThread = action.payload.thread;
        state.messages = action.payload.thread.messages || [];
      })
      .addCase(getThreadById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.message || 'Failed to fetch thread';
      })
      
      // Send message
      .addCase(sendMessage.pending, (state) => {
        state.sendingMessage = true;
        state.error = null;
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        state.sendingMessage = false;
        // Remove optimistic message if it exists
        state.messages = state.messages.filter(msg => !msg.optimistic);
        
        // Add both user message and assistant response
        // The API returns the assistant message, we need to add the user message from the request
        if (action.meta.arg.message) {
          state.messages.push({
            role: 'user',
            content: action.meta.arg.message,
            timestamp: new Date().toISOString()
          });
        }
        
        // Add assistant response
        if (action.payload.message) {
          state.messages.push({
            role: action.payload.message.role,
            content: action.payload.message.content,
            timestamp: action.payload.message.timestamp
          });
        }
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.sendingMessage = false;
        // Remove optimistic message on error
        state.messages = state.messages.filter(msg => !msg.optimistic);
        state.error = action.payload?.message || 'Failed to send message';
      })
      
      // Delete thread
      .addCase(deleteThread.fulfilled, (state, action) => {
        state.threads = state.threads.filter(t => t._id !== action.payload.threadId);
        if (state.currentThread?._id === action.payload.threadId) {
          state.currentThread = null;
          state.messages = [];
        }
      })
      
      // Clear thread
      .addCase(clearThread.fulfilled, (state, action) => {
        if (state.currentThread?._id === action.payload.threadId) {
          state.messages = [];
        }
        // Update thread in threads list
        const thread = state.threads.find(t => t._id === action.payload.threadId);
        if (thread) {
          thread.messageCount = 0;
        }
      });
  }
});

// Export actions
export const {
  toggleChat,
  openChat,
  closeChat,
  minimizeChat,
  setContext,
  addOptimisticMessage,
  clearError,
  resetChat
} = chatSlice.actions;

// Selectors
export const selectChatState = (state) => state.chat;
export const selectCurrentThread = (state) => state.chat.currentThread;
export const selectMessages = (state) => state.chat.messages;
export const selectIsOpen = (state) => state.chat.isOpen;
export const selectIsSendingMessage = (state) => state.chat.sendingMessage;
export const selectCurrentContext = (state) => state.chat.currentContext;

export default chatSlice.reducer;

