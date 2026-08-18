import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import promoCodesApi from "../../api/promoCodesApi";
const initialState = {
    loading: false,
    error: null,
    promocodes: [],
    promocodeDetail: null,
    users: [],
}
export const fetchPromocodes = createAsyncThunk(
    'promocode/fetchPromocodes',
    async ({ plan, active }, { rejectWithValue }) => {
        try {
            const res = await promoCodesApi.getAllPromoCodes(plan, active);
            return res.data;
        } catch (err) {
            const msg = err?.response?.data?.message || err.message || 'Failed to fetch promocodes';
            return rejectWithValue(msg);
        }
    }
)
export const addPromocode = createAsyncThunk(
    'promocode/addPromocode',
    async ({ code, description, expiryDate, eligibleUsers, maxUsagePerUser, applicablePlan }, { rejectWithValue }) => {
        try {
            const res = await promoCodesApi.createNewPromoCode({ code, description, expiryDate, eligibleUsers, maxUsagePerUser, applicablePlan });
            return res.data;
        } catch (err) {
            const msg = err?.response?.data?.message || err.message || 'Failed to add promocode';
            return rejectWithValue(msg);
        }
    }
)
export const updatePromocode = createAsyncThunk(
    'promocode/updatePromocode',
    async ({ id, code, description, expiryDate, eligibleUsers, maxUsagePerUser, applicablePlan }, { rejectWithValue }) => {
        try {
            const res = await promoCodesApi.updatePromoCode(id, { code, description, expiryDate, eligibleUsers, maxUsagePerUser, applicablePlan });
            return res.data;
        } catch (err) {
            const msg = err?.response?.data?.message || err.message || 'Failed to update promocode';
            return rejectWithValue(msg);
        }
    }
)
export const deletePromocode = createAsyncThunk(
    'promocode/deletePromocode',
    async (id, { rejectWithValue }) => {
        try {
            const res = await promoCodesApi.deletePromoCode(id);
            return res.data;
        } catch (err) {
            const msg = err?.response?.data?.message || err.message || 'Failed to delete promocode';
            return rejectWithValue(msg);
        }
    }
)
export const getPromocodeDetailById = createAsyncThunk(
    'promocode/getPromocodeDetailById',
    async (id, { rejectWithValue }) => {
        try {
            const res = await promoCodesApi.getPromoCodeDetailById(id);
            return res.data;
        } catch (err) {
            const msg = err?.response?.data?.message || err.message || 'Failed to get promocode detail';
            return rejectWithValue(msg);
        }
    }
)

export const fetchAllUsers = createAsyncThunk(
    'promocode/fetchAllUsers',
    async (_, { rejectWithValue }) => {
        try {
            const res = await promoCodesApi.getAllUsers();
            return res.data;
        } catch (err) {
            const msg = err?.response?.data?.message || err.message || 'Failed to fetch users';
            return rejectWithValue(msg);
        }
    }
)

const promocodeSlice = createSlice({
    name: "promocode",
    initialState,
    reducers: {
        clearError(state) {
            state.error = null;
        },
        clearSaved(state) {
            state.saved = false;
        },
        clearPromocodeDetail(state) {
            state.promocodeDetail = null;
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchPromocodes.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchPromocodes.fulfilled, (state, action) => {
                state.loading = false;
                state.promocodes = action.payload.data;
            })
            .addCase(fetchPromocodes.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            .addCase(addPromocode.pending, (state) => {
                state.loading = true;
            })
            .addCase(addPromocode.fulfilled, (state, action) => {
                state.loading = false;
                state.promocodes = [action.payload.data, ...state.promocodes];
            })
            .addCase(addPromocode.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            .addCase(updatePromocode.pending, (state) => {
                state.loading = true;
            })
            .addCase(updatePromocode.fulfilled, (state, action) => {
                state.loading = false;
                state.promocodes = state.promocodes.map(promocode => promocode._id === action.payload.data._id ? action.payload.data : promocode);
            })
            .addCase(updatePromocode.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            .addCase(deletePromocode.pending, (state) => {
                state.loading = true;
            })
            .addCase(deletePromocode.fulfilled, (state, action) => {
                state.loading = false;
                state.promocodes = state.promocodes.filter(promocode => promocode._id !== action.meta.arg);
            })
            .addCase(deletePromocode.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            .addCase(getPromocodeDetailById.pending, (state) => {
                state.loading = true;
            })
            .addCase(getPromocodeDetailById.fulfilled, (state, action) => {
                state.loading = false;
                state.promocodeDetail = action.payload.data;
            })
            .addCase(getPromocodeDetailById.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            .addCase(fetchAllUsers.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchAllUsers.fulfilled, (state, action) => {
                state.loading = false;
                state.users = action.payload.data;
            })
            .addCase(fetchAllUsers.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
    }
})

export const { clearError, clearSaved, clearPromocodeDetail } = promocodeSlice.actions;

export default promocodeSlice.reducer
