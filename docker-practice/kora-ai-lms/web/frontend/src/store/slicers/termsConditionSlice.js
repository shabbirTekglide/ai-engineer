import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import TermsConditionsApi from "../../api/termsConditionsApi";

export const getTermsConditions = createAsyncThunk(
    "termsConditions/getTermsConditions",
    async (_, { rejectWithValue }) => {
        try {
            const resp = await TermsConditionsApi.getTermsConditions();
            return resp.data;
        } catch (err) {
            return rejectWithValue(err.response?.data || { message: err.message });
        }
    }
);

export const acceptTermsConditions = createAsyncThunk(
    "termsConditions/acceptTermsConditions",
    async (_, { rejectWithValue }) => {
        try {
            const resp = await TermsConditionsApi.acceptTermsConditions();
            return resp.data;
        } catch (err) {
            return rejectWithValue(err.response?.data || { message: err.message });
        }
    }
);

export const updateTermsConditions = createAsyncThunk(
    "termsConditions/updateTermsConditions",
    async (_, { rejectWithValue }) => {
        try {
            const resp = await TermsConditionsApi.updateTermsConditions();
            return resp.data;
        } catch (err) {
            return rejectWithValue(err.response?.data || { message: err.message });
        }
    }
);

const initialState = {
    termsConditions: null,
    loading: false,
    error: null,
    termsConditionsAccepted: true,

};

const termsConditionSlice = createSlice({
    name: "termsConditions",
    initialState,
    reducers: {},
    extraReducers: (builder) => {
        builder
            .addCase(getTermsConditions.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(getTermsConditions.fulfilled, (state, action) => {
                state.loading = false;
                state.termsConditions = action.payload.data || null;
                state.termsConditionsAccepted = action.payload.accepted;
            })
            .addCase(getTermsConditions.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload || action.error;
            })
            .addCase(acceptTermsConditions.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(acceptTermsConditions.fulfilled, (state, action) => {
                state.loading = false;
                state.termsConditionsAccepted = action.payload.accepted;
            })
            .addCase(acceptTermsConditions.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload || action.error;
            })
            .addCase(updateTermsConditions.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(updateTermsConditions.fulfilled, (state, action) => {
                state.loading = false;
                state.termsConditions = action.payload.data;
            })
            .addCase(updateTermsConditions.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload || action.error;
            });
    },
});

export default termsConditionSlice.reducer;