import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import authApi from '../../api/authApi.js';
import { isTokenValid } from '../../utils/tokenValidity.js';
import paymentApi from '../../api/paymentApi.js';
import { createLecture } from './lectureSlice.js';


export const sendOtp = createAsyncThunk(
  'auth/sendOtp',
  async ({ email, name }, { rejectWithValue }) => {
    try {
      const response = await authApi.sendOtp(email, name);
      return response.data;
    } catch (error) {
      const msg = error.response?.data?.message || error.response?.data?.Message || 'Something went wrong';
      return rejectWithValue(msg);
    }
  }
);

export const verifyOtp = createAsyncThunk('auth/verifyOtp', async ({ email, otp }, { rejectWithValue }) => {
  try {
    const response = await authApi.verifyOtp(email, otp);
    return response.data;
  } catch (error) {
    const mess = error.response?.data?.message || error.response?.data?.message || "Something went wrong"
    return rejectWithValue(mess);
  }

});

export const setPassword = createAsyncThunk('auth/setPassword', async ({ email, password, confirm_password }, { rejectWithValue }) => {
  try {
    const response = await authApi.setPassword(email, password, confirm_password);
    return response.data;

  } catch (error) {
    const mess = error.response?.data?.message || error.response?.data?.message || "Something went wrong"
    return rejectWithValue(mess);
  }
});

export const login = createAsyncThunk('auth/login', async ({ email, password, role }, { rejectWithValue }) => {
  try {
    const response = await authApi.login(email, password, role);
    console.log('res', response.data)
    return response.data;
  } catch (error) {
    const msg = error.response?.data?.message || error.response?.data?.Message || 'Something went wrong';
    return rejectWithValue(msg);
  }

})

export const logoutUser = createAsyncThunk('auth/logout', async (_, { rejectWithValue }) => {
  try {
    const response = await authApi.logout();
    return response.data;

  } catch (error) {
    const msg = error.response?.data?.message || error.response?.data?.Message || 'Something went wrong';
    return rejectWithValue(msg);
  }
});

export const getSessions = createAsyncThunk('auth/getSessions', async (_, { rejectWithValue }) => {
  try {

    const response = await authApi.getSessions();
    return response.data;
  } catch (error) {
    const msg = error.response?.data?.message || error.response?.data?.Message || 'Something went wrong';
    return rejectWithValue(msg);
  }
});

export const revokeSession = createAsyncThunk('auth/revokeSession', async (id, { rejectWithValue }) => {
  try {

    const response = await authApi.revokeSession(id);
    if (response.data.success) {
      return id; // Return the session ID to identify which session was revoked
    }
    return response.data;
  } catch (error) {
    const msg = error.response?.data?.message || error.response?.data?.Message || 'Something went wrong';
    return rejectWithValue(msg);
  }
});
export const getSubscriptionInfo = createAsyncThunk('auth/subscriptionInfo', async (_, { rejectWithValue }) => {
  try {
    const response = await paymentApi.subscriptionInfo();
    return response.data.data;
  } catch (error) {
    const msg = error.response?.data?.message || error.response?.data?.Message || 'Something went wrong';
    return rejectWithValue(msg);
  }
});
export const cancelSubscription = createAsyncThunk('auth/cancelSubscription', async ({ userId, password }, { rejectWithValue }) => {
  try {
    const response = await paymentApi.cancelSubscription(userId, password);
    return response.data;
  } catch (error) {
    const msg = error.response?.data?.message || error.response?.data?.Message || 'Something went wrong';
    return rejectWithValue(msg);
  }
});

const token = localStorage.getItem('token');
const tokenData = isTokenValid(token);
console.log('tokenData', tokenData)
const initialState = {
  user: tokenData.user,
  role: tokenData.role,
  token: token || '',
  openPasswordModal: false,
  email: '',
  isLoggedIn: tokenData.valid,
  otpVerified: false,
  trialExpired: false,
  loading: false,
  error: null,
  sessions: [],
  currentSessionId: tokenData.sid || null,
  subscriptionType: 'free',
  subscriptionStatus: 'active',
  lastPaymentDate: null,
  availableHours: 0,
  availableSeconds: 0
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    toggleTrialExpired(state, action) {
      state.trialExpired = action.payload;
    },
    clearError(state) {
      state.error = null;
    },
    logout(state) {
      state.isLoggedIn = false,
        state.user = null,
        state.token = ""
      // localStorage.removeItem('token');
    },
    openPasswordModal(state, action) {
      state.openPasswordModal = action.payload;
    },
    setGoogleAuthData(state, action) {
      const { token, user } = action.payload;
      const tokenData = isTokenValid(token);

      state.isLoggedIn = true;
      state.token = token;
      state.user = user;
      state.role = tokenData.role;
      state.currentSessionId = tokenData.sid;

      localStorage.setItem('token', token);
    },

    setSubscriptionInfo(state, action) {
      console.log('action.payload', action.payload)
      state.subscriptionType = action.payload.type;
      state.subscriptionStatus = action.payload.status;
      state.availableHours = action.payload.availableHours;
      state.availableSeconds = action.payload.availableSeconds;
      state.lastPaymentDate = action.payload.lastPaymentDate;
    }
  },
  extraReducers: (builder) => {
    builder
      // sendOtp
      .addCase(sendOtp.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(sendOtp.fulfilled, (state, action) => {
        state.loading = false;
        state.email = action.payload.email;
      })
      .addCase(sendOtp.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to send OTP';
      })
      // verifyOtp
      .addCase(verifyOtp.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(verifyOtp.fulfilled, (state) => {
        state.loading = false;
        state.otpVerified = true;
      })
      .addCase(verifyOtp.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || "Failed to verify Otp";
      })
      // setPassword
      .addCase(setPassword.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(setPassword.fulfilled, (state) => {
        state.loading = false;
      })
      .addCase(setPassword.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })
      // login
      .addCase(login.pending, (state, action) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        const tokendata = isTokenValid(action.payload.token)
        state.isLoggedIn = true;
        state.loading = false;
        state.role = tokendata.role;
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.currentSessionId = tokendata.sid;
        localStorage.setItem('token', action.payload.token);
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || "Login failed. Please try again.";
      })
      // logout
      .addCase(logoutUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(logoutUser.fulfilled, (state, action) => {

        state.isLoggedIn = false,
          state.user = null,
          state.token = "",
          state.loading = false;
        localStorage.removeItem('token');

      })
      .addCase(logoutUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })
      // getSessions
      .addCase(getSessions.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getSessions.fulfilled, (state, action) => {
        state.loading = false;
        state.sessions = action.payload.sessions;
      })
      .addCase(getSessions.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })
      // revokeSession
      .addCase(revokeSession.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(revokeSession.fulfilled, (state, action) => {
        state.loading = false;
        state.sessions = state.sessions.map(sess =>
          sess._id === action.payload ? { ...sess, revokedAt: new Date().toISOString() } : sess
        );
      })
      .addCase(revokeSession.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })
      // subscriptionInfo
      .addCase(getSubscriptionInfo.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getSubscriptionInfo.fulfilled, (state, action) => {
        state.subscriptionType = action.payload.type;
        state.subscriptionStatus = action.payload.status;
        state.availableHours = action.payload.availableHours;
        state.availableSeconds = action.payload.availableSeconds;
        state.lastPaymentDate = action.payload.lastPaymentDate;
        state.loading = false;
      })
      .addCase(getSubscriptionInfo.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })
      // subscriptionInfo
      .addCase(createLecture.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createLecture.fulfilled, (state, action) => {
        state.subscriptionType = action.payload.type;
        state.subscriptionStatus = action.payload.status;
        state.availableHours = action.payload.availableHours;
        state.availableSeconds = action.payload.availableSeconds;
        state.loading = false;
      })
      .addCase(createLecture.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })
      .addCase(cancelSubscription.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(cancelSubscription.fulfilled, (state, action) => {
        state.loading = false;
        state.subscriptionStatus = 'cancelled';
      })
      .addCase(cancelSubscription.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || action.error.message;
      });
  },
});

export const { clearError, logout, openPasswordModal, setGoogleAuthData, toggleTrialExpired, setSubscriptionInfo } = authSlice.actions;
export default authSlice.reducer;