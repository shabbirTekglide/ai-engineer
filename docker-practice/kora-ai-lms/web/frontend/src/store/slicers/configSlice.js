import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { configApi } from '../../api/configApi';
import paymentApi from '../../api/paymentApi';

const initialState = {
  loading: false,
  error: null,
  settings: null,
  models: [],
  saved: false,
  subscriptions: [],
};

export const fetchConfig = createAsyncThunk(
  'config/fetchConfig',
  async (_, { rejectWithValue }) => {
    try {
      const res = await configApi.getConfig();
      return res.data;
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to fetch config';
      return rejectWithValue(msg);
    }
  }
);

export const updateConfig = createAsyncThunk(
  'config/updateConfig',
  async (payload, { rejectWithValue }) => {
    try {
      const res = await configApi.updateConfig(payload);
      return res.data;
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to update config';
      return rejectWithValue(msg);
    }
  }
);

export const addModel = createAsyncThunk(
  'config/addModel',
  async (payload, { rejectWithValue }) => {
    try {
      const res = await configApi.addModel(payload);
      return res.data;
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to add model';
      return rejectWithValue(msg);
    }
  }
);

export const getAllSubscriptions = createAsyncThunk(
  'config/getAllSubscriptions',
  async (plan, { rejectWithValue }) => {
    try {
      const res = await paymentApi.getAllSubscriptions(plan);
      return res.data;
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to fetch subscriptions';
      return rejectWithValue(msg);
    }
  }
);
export const cancelSubscription = createAsyncThunk(
  'config/cancelSubscription',
  async ({userId, password}, { rejectWithValue }) => {
    try {
      const res = await paymentApi.cancelSubscription(userId, password);
      return res.data;
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Failed to cancel subscription';
      return rejectWithValue(msg);
    }
  }
);
const configSlice = createSlice({
  name: 'adminConfig',
  initialState,
  reducers: {
    clearError(state) {
      state.error = null;
    },
    clearSaved(state) {
      state.saved = false;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchConfig.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchConfig.fulfilled, (state, action) => {
        state.loading = false;
        state.settings = action.payload.settings || action.payload;
        state.models = (state.settings && state.settings.models) || [];
      })
      .addCase(fetchConfig.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || action.error.message;
      })

      .addCase(updateConfig.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.saved = false;
      })
      .addCase(updateConfig.fulfilled, (state, action) => {
        state.loading = false;
        state.settings = action.payload.settings || action.payload;
        state.models = state.settings.models || [];
        state.saved = true;
      })
      .addCase(updateConfig.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || action.error.message;
      })

      .addCase(addModel.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(addModel.fulfilled, (state, action) => {
        state.loading = false;
        // action.payload.model contains the added model; server also returns settings
        if (action.payload.model) {
          state.models = state.models || [];
          state.models.push(action.payload.model);
        }
        if (action.payload.settings) state.settings = action.payload.settings;
      })
      .addCase(addModel.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || action.error.message;
      })
      .addCase(getAllSubscriptions.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getAllSubscriptions.fulfilled, (state, action) => {
        state.loading = false;
        state.subscriptions = action.payload.data || [];
      })
      .addCase(getAllSubscriptions.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || action.error.message;
      })
      .addCase(cancelSubscription.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(cancelSubscription.fulfilled, (state, action) => {
        state.loading = false;
        
        // User ID hum action.meta.arg se le rahe hain (jo thunk call krte waqt pass kia tha)
        const canceledUserId = action.meta.arg.userId;

        if (state.subscriptions) {
          state.subscriptions = state.subscriptions.map((user) =>
            user.id === canceledUserId
              ? { ...user, status: 'cancelled' } // Instant UI update
              : user
          );
        }
      })
      .addCase(cancelSubscription.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || action.error.message;
      });
  },
});

export const { clearError, clearSaved } = configSlice.actions;
export default configSlice.reducer;
