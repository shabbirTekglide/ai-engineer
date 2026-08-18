import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import studentProfileApi from '../../api/studentProfileApi';

const getApiErrorMessage = (err, fallback) => {
	const data = err?.response?.data;
	const firstError = data?.errors?.[0];

	if (typeof firstError === 'string' && firstError.trim()) {
		return firstError;
	}

	if (firstError?.message) {
		return firstError.message;
	}

	if (data?.message && data.message !== 'Validation failed') {
		return data.message;
	}

	if (typeof data === 'string' && data.trim()) {
		return data;
	}

	return fallback || err.message;
};

// Thunks
export const checkStudentProfileCreated = createAsyncThunk(
	'studProfile/checkCreated',
	async (_, { rejectWithValue }) => {
		try {
			const resp = await studentProfileApi.checkStudentProfileCreated();
			return resp.data;
		} catch (err) {
			return rejectWithValue(err.response?.data || { message: err.message });
		}
	}
);

export const createStudentProfile = createAsyncThunk(
	'studProfile/create',
	async (formData, { rejectWithValue }) => {
		try {
			const resp = await studentProfileApi.createStudentProfile(formData);
			return resp.data;
		} catch (err) {
			return rejectWithValue(getApiErrorMessage(err, 'Failed to create student profile'));
		}
	}
);


export const updateStudentProfile = createAsyncThunk(
	'studProfile/update',
	async (formData, { rejectWithValue }) => {
		try {
			const resp = await studentProfileApi.updateStudentProfile(formData);
			return resp.data;
		} catch (err) {
			console.log(err, "error from update")
			return rejectWithValue(getApiErrorMessage(err, 'Failed to update profile'));
		}
	}
);

export const getStudentProfile = createAsyncThunk(
	'studProfile/get',
	async (_, { rejectWithValue }) => {
		try {
			const resp = await studentProfileApi.getStudentProfile();
			return resp.data;
		} catch (err) {
			return rejectWithValue(err.response?.data?.message || err.response?.data || { message: err.message });
		}
	}
);

const initialState = {
	profileExists: true,
	profile: null,
	loading: false,
	error: null,
};

const studProfileSlice = createSlice({
	name: 'studentprofile',
	initialState,
	reducers: {
		clearStudProfileError(state) {
			state.error = null;
		},
		resetStudProfileState(state) {
			state.profileExists = null;
			state.profile = null;
			state.loading = false;
			state.error = null;
		}
	},
	extraReducers: (builder) => {
		builder
			// checkStudentProfileCreated
			.addCase(checkStudentProfileCreated.pending, (state) => {
				state.loading = true;
				state.error = null;
			})
			.addCase(checkStudentProfileCreated.fulfilled, (state, action) => {
				state.loading = false;
				// expecting API to return something like { exists: true }
				state.profileExists = action.payload?.exists ?? null;
			})
			.addCase(checkStudentProfileCreated.rejected, (state, action) => {
				state.loading = false;
				state.error = action.payload || action.error;
			})

			// createStudentProfile
			.addCase(createStudentProfile.pending, (state) => {
				state.loading = true;
				state.error = null;
			})
			.addCase(createStudentProfile.fulfilled, (state, action) => {
				state.loading = false;
				state.profile = action.payload?.profile;
				state.profileExists = true;
			})
			.addCase(createStudentProfile.rejected, (state, action) => {
				state.loading = false;
				state.error = action.payload || action.error;
			})

			// updateStudentProfile
			.addCase(updateStudentProfile.pending, (state) => {
				state.loading = true;
				state.error = null;
			})
			.addCase(updateStudentProfile.fulfilled, (state, action) => {
				state.loading = false;
				state.profile = action.payload?.profile;
			})
			.addCase(updateStudentProfile.rejected, (state, action) => {
				state.loading = false;
				state.error = action.payload || action.error;
			})

			// getStudentProfile
			.addCase(getStudentProfile.pending, (state) => {
				state.loading = true;
				state.error = null;
			})
			.addCase(getStudentProfile.fulfilled, (state, action) => {
				state.loading = false;
				state.profile = action.payload.profile;
				state.profileExists = !!action.payload;
			})
			.addCase(getStudentProfile.rejected, (state, action) => {
				state.loading = false;
				state.error = action.payload || action.error;
			});
	}
});

export const { clearStudProfileError, resetStudProfileState } = studProfileSlice.actions;

export default studProfileSlice.reducer;

