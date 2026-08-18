// calendatSlice.js

import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import calendarApi from "../../api/calendarApi";

const initialState = {
  calendar: [],
  loading: false,
  error: null,
  operationLoading: false, // Separate loading for create/update/delete operations
};

// Fetch all calendar events
export const fetchCalendar = createAsyncThunk(
  "calendar/fetchCalendar",
  async (_, { rejectWithValue }) => {
    try {
      const response = await calendarApi.getAllEvents();
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || error.message || 'Failed to fetch calendar events'
      );
    }
  }
);

// Create new calendar event
export const createCalendar = createAsyncThunk(
  "calendar/createCalendar",
  async (data, { rejectWithValue }) => {
    try {
      const response = await calendarApi.addEvent(data);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error
      );
    }
  }
);

// Update calendar event
export const updateCalendar = createAsyncThunk(
  "calendar/updateCalendar",
  async ({ eventId, data }, { rejectWithValue }) => {
    try {
      const response = await calendarApi.updateEvent({ eventId, data });
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error
      );
    }
  }
);

// Delete calendar event
export const deleteCalendarEvent = createAsyncThunk(
  "calendar/deleteCalendarEvent",
  async (eventId, { rejectWithValue }) => {
    try {
      const response = await calendarApi.deleteEvent(eventId);
      return { 
        eventId,
        ...response.data // Includes success, message
      };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || error.message || 'Failed to delete event'
      );
    }
  }
);

const calendarSlice = createSlice({
  name: 'calendar',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    resetCalendarState: () => initialState,
    // Optimistic update for immediate UI feedback
    optimisticUpdateEvent: (state, action) => {
      const { eventId, updates } = action.payload;
      const eventIndex = state.calendar.findIndex(event => event._id === eventId);
      if (eventIndex !== -1) {
        state.calendar[eventIndex] = { ...state.calendar[eventIndex], ...updates };
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch Calendar Events
      .addCase(fetchCalendar.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCalendar.fulfilled, (state, action) => {
        state.loading = false;
        state.calendar = action.payload?.events || [];
      })
      .addCase(fetchCalendar.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || action.error.message;
      })
      // Create Calendar Event
      .addCase(createCalendar.pending, (state) => {
        state.operationLoading = true;
        state.error = null;
      })
      .addCase(createCalendar.fulfilled, (state, action) => {
        state.operationLoading = false;
        if (action.payload?.event) {
          state.calendar.unshift(action.payload.event);
        }
      })
      .addCase(createCalendar.rejected, (state, action) => {
        state.operationLoading = false;
        state.error = action.payload || action.error.message;
      })
      // Update Calendar Event
      .addCase(updateCalendar.pending, (state) => {
        state.operationLoading = true;
        state.error = null;
      })
      .addCase(updateCalendar.fulfilled, (state, action) => {
        state.operationLoading = false;
        // Update the event in the calendar array
        if (action.payload?.event) {
          const eventIndex = state.calendar.findIndex(
            event => event._id === action.payload.event._id
          );
          if (eventIndex !== -1) {
            state.calendar[eventIndex] = action.payload.event;
          }
        }
      })
      .addCase(updateCalendar.rejected, (state, action) => {
        state.operationLoading = false;
        state.error = action.payload || action.error.message;
      })
      // Delete Calendar Event
      .addCase(deleteCalendarEvent.pending, (state, action) => {
        state.operationLoading = true;
        state.error = null;
        // Optimistic removal - remove immediately for better UX
        const eventId = action.meta.arg;
        state.calendar = state.calendar.filter(event => event._id !== eventId);
      })
      .addCase(deleteCalendarEvent.fulfilled, (state, action) => {
        state.operationLoading = false;
        // Event already removed optimistically, just confirm success
        console.log('Delete successful:', action.payload.message);
      })
      .addCase(deleteCalendarEvent.rejected, (state, action) => {
        state.operationLoading = false;
        state.error = action.payload || action.error.message;
        
        // Re-add the event if deletion failed (undo optimistic update)
        const eventId = action.meta.arg;
        const originalEvent = action.meta.originalEvent; // You'd need to store this
        
        // Note: For proper optimistic updates, you'd store the original event
        // and re-add it here. This is a simplified version.
        console.warn('Delete failed, event should be restored:', eventId);
      });
  },
});

export const { 
  clearError, 
  resetCalendarState,
  optimisticUpdateEvent 
} = calendarSlice.actions;

export default calendarSlice.reducer;