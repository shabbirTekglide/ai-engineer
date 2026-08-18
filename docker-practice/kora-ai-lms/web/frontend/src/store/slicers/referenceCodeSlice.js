import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import referenceCodesApi from "../../api/referenceCodesApi";

const initialState = {
    loading: false,
    error: null,
    referenceCodes: [],
    plans: [],
    referenceCodeDetail: null,
    users: [],
    attributionReport: [],
    attributionLoading: false,
};


export const fetchReferenceCodes = createAsyncThunk(
    'referenceCode/fetchReferenceCodes',
    async ({ active, semester }, { rejectWithValue }) => {
        try {
            const res = await referenceCodesApi.getAllReferenceCodes({ active, semester });
            return res.data;
        } catch (err) {
            const msg = err?.response?.data?.message || err.message || 'Failed to fetch reference codes';
            return rejectWithValue(msg);
        }
    }
);

export const addReferenceCode = createAsyncThunk(
    'referenceCode/addReferenceCode',
    async (payload, { rejectWithValue }) => {
        try {
            console.log("Adding reference code with payload:", payload);
            const res = await referenceCodesApi.createReferenceCode(payload);
            return res.data;
        } catch (err) {
            const msg = err?.response?.data?.message || err.message || 'Failed to add reference code';
            return rejectWithValue(msg);
        }
    }
);

export const updateReferenceCode = createAsyncThunk(
    'referenceCode/updateReferenceCode',
    async ({ id, ...payload }, { rejectWithValue }) => {
        try {
            console.log("Updating reference code with ID:", id, "and payload:", payload);
            const res = await referenceCodesApi.updateReferenceCode(id, payload);
            return res.data;
        } catch (err) {
            const msg = err?.response?.data?.message || err.message || 'Failed to update reference code';
            return rejectWithValue(msg);
        }
    }
);

export const deleteReferenceCode = createAsyncThunk(
    'referenceCode/deleteReferenceCode',
    async (id, { rejectWithValue }) => {
        try {
            const res = await referenceCodesApi.deleteReferenceCode(id);
            return res.data;
        } catch (err) {
            const msg = err?.response?.data?.message || err.message || 'Failed to delete reference code';
            return rejectWithValue(msg);
        }
    }
);

export const importReferenceCodes = createAsyncThunk(
    'referenceCode/importReferenceCodes',
    async (formData, { rejectWithValue }) => {
        try {
            const res = await referenceCodesApi.importReferenceCodes(formData);
            return res.data;
        } catch (err) {
            const msg = err?.response?.data?.message || err.message || 'Failed to import reference codes';
            return rejectWithValue(msg);
        }
    }
);

export const getReferenceCodeDetailById = createAsyncThunk(
    'referenceCode/getReferenceCodeDetailById',
    async (id, { rejectWithValue }) => {
        try {
            const res = await referenceCodesApi.getReferenceCodeDetailById(id);
            return res.data;
        } catch (err) {
            const msg = err?.response?.data?.message || err.message || 'Failed to get reference code detail';
            return rejectWithValue(msg);
        }
    }
);

export const fetchReferenceUsers = createAsyncThunk(
    'referenceCode/fetchReferenceUsers',
    async (_, { rejectWithValue }) => {
        try {
            const res = await referenceCodesApi.getAllUsers();
            return res.data;
        } catch (err) {
            const msg = err?.response?.data?.message || err.message || 'Failed to fetch users';
            return rejectWithValue(msg);
        }
    }
);

export const fetchAttributionReport = createAsyncThunk(
    'referenceCode/fetchAttributionReport',
    async (_, { rejectWithValue }) => {
        try {
            const res = await referenceCodesApi.getAttributionReport();
            return res.data;
        } catch (err) {
            const msg = err?.response?.data?.message || err.message || 'Failed to fetch attribution report';
            return rejectWithValue(msg);
        }
    }
);


const referenceCodeSlice = createSlice({
    name: "referenceCode",
    initialState,
    reducers: {
        clearReferenceCodeDetail(state) {
            state.referenceCodeDetail = null;
        },
        clearReferenceCodeError(state) {
            state.error = null;
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchReferenceCodes.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchReferenceCodes.fulfilled, (state, action) => {
                state.loading = false;
                state.referenceCodes = action.payload.data;
                state.plans = action.payload.plans || [];
            })
            .addCase(fetchReferenceCodes.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            .addCase(addReferenceCode.pending, (state) => {
                state.loading = true;
            })
            .addCase(addReferenceCode.fulfilled, (state, action) => {
                state.loading = false;
                state.referenceCodes = [action.payload.data, ...state.referenceCodes];
            })
            .addCase(addReferenceCode.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            .addCase(updateReferenceCode.pending, (state) => {
                state.loading = true;
            })
            .addCase(updateReferenceCode.fulfilled, (state, action) => {
                state.loading = false;
                state.referenceCodes = state.referenceCodes.map(referenceCode =>
                    referenceCode._id === action.payload.data._id ? action.payload.data : referenceCode
                );
            })
            .addCase(updateReferenceCode.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            .addCase(deleteReferenceCode.pending, (state) => {
                state.loading = true;
            })
            .addCase(deleteReferenceCode.fulfilled, (state, action) => {
                state.loading = false;
                state.referenceCodes = state.referenceCodes.filter(referenceCode => referenceCode._id !== action.meta.arg);
            })
            .addCase(deleteReferenceCode.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            .addCase(importReferenceCodes.pending, (state) => {
                state.loading = true;
            })
            .addCase(importReferenceCodes.fulfilled, (state, action) => {
                state.loading = false;
                state.referenceCodes = [...action.payload.data, ...state.referenceCodes];
            })
            .addCase(importReferenceCodes.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            .addCase(getReferenceCodeDetailById.pending, (state) => {
                state.loading = true;
            })
            .addCase(getReferenceCodeDetailById.fulfilled, (state, action) => {
                state.loading = false;
                state.referenceCodeDetail = action.payload.data;
            })
            .addCase(getReferenceCodeDetailById.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            .addCase(fetchReferenceUsers.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchReferenceUsers.fulfilled, (state, action) => {
                state.loading = false;
                state.users = action.payload.data;
            })
            .addCase(fetchReferenceUsers.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            .addCase(fetchAttributionReport.pending, (state) => {
                state.attributionLoading = true;
            })
            .addCase(fetchAttributionReport.fulfilled, (state, action) => {
                state.attributionLoading = false;
                state.attributionReport = action.payload.data;
            })
            .addCase(fetchAttributionReport.rejected, (state, action) => {
                state.attributionLoading = false;
                state.error = action.payload;
            });
    }
});

export const { clearReferenceCodeDetail, clearReferenceCodeError } = referenceCodeSlice.actions;

export default referenceCodeSlice.reducer;
