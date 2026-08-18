//store/store.js
import { combineReducers, configureStore } from "@reduxjs/toolkit";
import authReducer, { logout, logoutUser } from "./slicers/authSlice.js";
import classSlice from "./slicers/classSlice.js";
import lectureSlice from "./slicers/lectureSlice.js";
import learnSlice from "./slicers/learnSlice.js";
import calendarSlice from "./slicers/calendarSlice.js";
import settingSlice from "./slicers/settingSlice.js";
import chatSlice from "./slicers/chatSlice.js";
import comprehensionSlice from "./slicers/comprehensionSlice.js";
import transcriptionSlice from "./slicers/transcriptionSlice.js";
import queueSlice from "./slicers/queueSlice.js";
import studProfileSlice from "./slicers/studProfileSlice.js";
import adminConfigSlice from "./slicers/configSlice.js";
import promocodeSlice from "./slicers/promocodeSlice.js";
import referenceCodeSlice from "./slicers/referenceCodeSlice.js";
import termsConditionSlice from "./slicers/termsConditionSlice.js";
const appReducer = combineReducers({
  auth: authReducer,
  class: classSlice,
  lecture: lectureSlice,
  learn: learnSlice,
  calendar: calendarSlice,
  setting: settingSlice,
  chat: chatSlice,
  comprehension: comprehensionSlice,
  transcription: transcriptionSlice,
  queue: queueSlice,
  studentprofile: studProfileSlice,
  adminConfig: adminConfigSlice,
  promocode: promocodeSlice,
  referenceCode: referenceCodeSlice,
  termsCondition: termsConditionSlice,
});

const rootReducer = (state, action) => {
  if (
    action.type === logoutUser.fulfilled.type     // thunk fulfilled
  ) {
    state = undefined;
  }
  return appReducer(state, action);
};

const store = configureStore({
  reducer: rootReducer,
  //   middleware: (gDM) => gDM({ serializableCheck: false }),
});

export default store;
