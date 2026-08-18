import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import settingApi from '../../api/settings';

const initialState = {
  notificationEnabled: true,
  eventReminders: true,
  loading: false,
  error: null,
};

export const fetchSettings = createAsyncThunk(
  'setting/fetchSettings',
  async (_, { rejectWithValue }) => {
    try {
      const response = await settingApi.getSettings();
      return response.data;
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to fetch settings';
      return rejectWithValue(msg);
    }
  }
);

export const toggleNotification = createAsyncThunk(
  'setting/toggleNotification',
  async (_, { rejectWithValue }) => {
    try {
      const response = await settingApi.toggleNotification();
      return response.data;
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to toggle notification';
      return rejectWithValue(msg);
    }
  }
);

export const toggleStudyReminder = createAsyncThunk(
  'setting/toggleStudyReminder',
  async (_, { rejectWithValue }) => {
    try {
      const response = await settingApi.toggleStudyReminder();
      return response.data;
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to toggle study reminders';
      return rejectWithValue(msg);
    }
  }
);

const settingSlice = createSlice({
  name: 'setting',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // fetch settings
      .addCase(fetchSettings.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSettings.fulfilled, (state, action) => {
        state.loading = false;
        state.notificationEnabled = action.payload.settings.notificationEnabled;
        state.eventReminders = action.payload.settings.studyReminders;
      })
      .addCase(fetchSettings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || action.error.message;
      })

      // toggle Notification
      .addCase(toggleNotification.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(toggleNotification.fulfilled, (state, action) => {
        state.loading = false;
        state.notificationEnabled = action.payload.notificationEnabled;
      })
      .addCase(toggleNotification.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || action.error.message;
      })

      // toggle studyReminder
      .addCase(toggleStudyReminder.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(toggleStudyReminder.fulfilled, (state, action) => {
        state.loading = false;
        state.eventReminders = action.payload.studyReminders;
      })
      .addCase(toggleStudyReminder.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || action.error.message;
      });
  },
});

export default settingSlice.reducer;
