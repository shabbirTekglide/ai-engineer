import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

const initialState = {
    isNotificationEnabled : true,
    EventReminders: true,
}


const notificationSlice = createSlice({
    name: "notification",
    initialState,
    reducers:{
        toggleNotification(state){
            state.isNotificationEnabled = (!state.isNotificationEnabled)
        },
        ToggleEventReminder(state){
            state.EventReminders = (!state.EventReminders)
        }
    }
})

export const { ToggleEventReminder, toggleNotification } = notificationSlice.actions;
export default notificationSlice.reducer;