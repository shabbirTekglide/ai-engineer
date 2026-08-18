import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import learnApi from "../../api/learnApi";

const initialState = {
  loading: false,
  error: null,
  quiz: [], // Keep as array since you're storing questions array
  flashCards: { cards: [] }, // Object with cards array
  studyGuides: [], // Array of study guide objects { lectureId, title, studyGuide, cached, error }
  selectedClassId: '', // Fixed property name to match component
  selectedLectureIds: [], // Fixed property name to match component
  selectedDocumentIds: [], // Fixed property name to match component
}

export const getQuiz = createAsyncThunk(
  "learn/getQuiz",
  async ({ classId, lectureIds, documentIds }, { rejectWithValue }) => {
    try {
      let newLectureIds = [...new Set([...lectureIds, ...documentIds])];
      console.log("newLectureIds", newLectureIds);
      const response = await learnApi.getQuiz({ classId, lectureIds: newLectureIds });
      return response?.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || error.message || 'Failed to fetch quiz'
      );
    }
  }
);

export const getFlashCards = createAsyncThunk(
  "learn/getFlashCards",
  async ({ classId, lectureIds, documentIds }, { rejectWithValue }) => {
    try {
      let newLectureIds = [...new Set([...lectureIds, ...documentIds])];
      console.log("newLectureIds", newLectureIds);
      const response = await learnApi.getFlashCards({ classId, lectureIds: newLectureIds });
      return response?.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || error.message || 'Failed to fetch flashcards'
      );
    }
  }
);

export const getLearingPod = createAsyncThunk(
  "learn/getLearingPod",
  async ({ classId, lectureIds, documentIds }, { rejectWithValue }) => {
    try {
      let newLectureIds = [...new Set([...lectureIds, ...documentIds])];
      console.log("newLectureIds", newLectureIds);
      const response = await learnApi.getLearingPod({ classId, lectureIds: newLectureIds });
      return response?.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || error.message || 'Failed to fetch Study Guide'
      );
    }
  }
);

const learnSlice = createSlice({
  name: 'learn',
  initialState,
  reducers: {
    clearQuizes: (state) => {
      state.quiz = [];
      state.error = null;
    },
    clearStudyGuide: (state) => {
      state.studyGuides = [];
      state.error = null;
    },
    clearFlashCards: (state) => {
      state.flashCards = { cards: [] };
      state.error = null;
    },
    clearError: (state) => {
      state.error = null;
    },
    setSelectedClassAndLecture: (state, action) => {
      // Fixed: use the correct property names that match the component
      const { selectedClassId, selectedLectureIds, selectedDocumentIds } = action.payload;
      state.selectedClassId = selectedClassId;
      state.selectedLectureIds = selectedLectureIds;
      state.selectedDocumentIds = selectedDocumentIds;
    }
  },
  extraReducers: (builder) => {
    builder
      // Quiz cases
      .addCase(getQuiz.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getQuiz.fulfilled, (state, action) => {
        state.loading = false;
        state.quiz = action.payload?.quiz || [];
        state.error = null;
      })
      .addCase(getQuiz.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        state.quiz = []; // Clear quiz on error
      })
      // FlashCards cases
      .addCase(getFlashCards.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getFlashCards.fulfilled, (state, action) => {
        state.loading = false;
        state.flashCards = action.payload?.flashcards || { cards: [] };
        state.error = null;
      })
      .addCase(getFlashCards.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        state.flashCards = { cards: [] }; // Clear flashcards on error
      })
      // Study Guide cases
      .addCase(getLearingPod.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getLearingPod.fulfilled, (state, action) => {
        state.loading = false;
        // New structure: data.studyGuides is array of { lectureId, title, studyGuide, cached, error }
        state.studyGuides = action.payload?.data?.studyGuides || [];
        state.error = null;
      })
      .addCase(getLearingPod.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        state.studyGuides = [];
      });
  }
})

export const {
  clearFlashCards,
  clearQuizes,
  clearError,
  clearStudyGuide, // Added missing export
  setSelectedClassAndLecture
} = learnSlice.actions;

export default learnSlice.reducer;
