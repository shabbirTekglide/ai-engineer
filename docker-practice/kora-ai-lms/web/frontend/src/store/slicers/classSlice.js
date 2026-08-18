// import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
// import ClassApi from "../../api/classApi.js";

// const initialState = {
//     classes: [],
//     currentClass:{},
//     loading: false,
//     error: null,
//     classLectureId:[]
//   };
// export const fetchClasses = createAsyncThunk(
//   "class/fetchClasses",
//   async () => {
//     const response = await ClassApi.getClasses();
//     return response.data; // Assuming the API returns an array of classes
//   }
// );

// export const createClass = createAsyncThunk(
//   "class/createClass",
//   async (formData) => { // Remove the destructuring - formData is passed directly
//     const response = await ClassApi.createClass(formData);
//     return response.data;
//   }
// );

// export const getClassById = createAsyncThunk(
//   "class/getClassById",
//   async (classId) => {
//     const response = await ClassApi.getClassById(classId);
//     return response.data; // Assuming the API returns the created class
//   }
// );

// export const uploadFile = createAsyncThunk(
//   "class/uploadFile",
//   async ({classId,formData}) => {
//     const response = await ClassApi.uploadSyllabus({classId, formData});
//     return response.data; // Assuming the API returns the created class
//   }
// ); 

// export const getClassLecturesId = createAsyncThunk(
//   "class/getClassLectures",
//   async () => {
//     const response = await ClassApi.getClassLecturesId();
//     return response.data; // Assuming the API returns the created class
//   }
// ); 

// const classSlice = createSlice({
//   name: "class",
//   initialState,
//   reducers: {
//     clearCurrentClass : (state)=>{
//       state.currentClass = {}
//     }
//   },
//   extraReducers: (builder) => {
//     builder
//       .addCase(fetchClasses.pending, (state) => {
//         state.loading = true;
//         state.error = null;
//       })
//       .addCase(fetchClasses.fulfilled, (state, action) => {
//         state.loading = false;
//         state.classes = action.payload.classes; // Adjust based on actual response structure
//       })
//       .addCase(fetchClasses.rejected, (state, action) => {
//         state.loading = false;
//         state.error = action.error.message;
//       })
//       .addCase(createClass.pending, (state) => {        
//         state.loading = true;
//         state.error = null;
//       })
//       .addCase(createClass.fulfilled, (state, action) => {
//         state.loading = false;
//         state.classes.unshift(action.payload.class); // Adjust based on actual response structure
//       })
//       .addCase(createClass.rejected, (state, action) => {
//         state.loading = false;
//         state.error = action.error.message;
//       })
//        .addCase(getClassById.pending, (state) => {        
//         state.loading = true;
//         state.error = null;
//       })
//       .addCase(getClassById.fulfilled, (state, action) => {
//         state.loading = false;
//         state.currentClass =action.payload.class; // Adjust based on actual response structure
//       })
//       .addCase(getClassById.rejected, (state, action) => {
//         state.loading = false;
//         state.error = action.error.message;
//       })
//        .addCase(uploadFile.pending, (state) => {        
//         state.loading = true;
//         state.error = null;
//       })
//       .addCase(uploadFile.fulfilled, (state, action) => {
//         state.loading = false;
//         state.currentClass.syllabus =action.payload.asset.url; // Adjust based on actual response structure
//       })
//       .addCase(uploadFile.rejected, (state, action) => {
//         state.loading = false;
//         state.error = action.error.message;
//       })
//       .addCase(getClassLecturesId.pending, (state) => {        
//         state.loading = true;
//         state.error = null;
//       })
//       .addCase(getClassLecturesId.fulfilled, (state, action) => {
//         state.loading = false;
//         state.classLectureId =action.payload?.data; // Adjust based on actual response structure
//       })
//       .addCase(getClassLecturesId.rejected, (state, action) => {
//         state.loading = false;
//         state.error = action.error.message;
//       });
//   },
// });

// export default classSlice.reducer;

import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import ClassApi from "../../api/classApi.js";

const initialState = {
  classes: [],
  currentClass: {},
  loading: false,
  error: null,
  classLectureId: [],
  uploadLoading: false, // Separate loading state for uploads
  createLoading: false, // Separate loading state for creation
};

// Fetch all classes
export const fetchClasses = createAsyncThunk(
  "class/fetchClasses",
  async (_, { rejectWithValue }) => {
    try {
      const response = await ClassApi.getClasses();
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || error.message || 'Failed to fetch classes'
      );
    }
  }
);

// Create new class
export const createClass = createAsyncThunk(
  "class/createClass",
  async (formData, { rejectWithValue }) => {
    try {
      const response = await ClassApi.createClass(formData);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || error.message || 'Failed to create class'
      );
    }
  }
);

// Get class by ID
export const getClassById = createAsyncThunk(
  "class/getClassById",
  async (classId, { rejectWithValue }) => {
    try {
      const response = await ClassApi.getClassById(classId);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || error.message || 'Failed to fetch class'
      );
    }
  }
);


export const uploadFile = createAsyncThunk(
  "class/uploadFile",
  async ({ classId, formData }, { rejectWithValue }) => {
    try {
      const response = await ClassApi.uploadSyllabus(classId, formData );
      return response.data;
    } catch (error) {
      // Check for timeout specifically
      const isTimeout = error.code === 'ECONNABORTED' || 
                       error.message?.includes('timeout') ||
                       error.message?.includes('Timeout');
      
      // Check for connection errors
      const isConnectionError = error.code === 'ECONNRESET' || 
                               error.code === 'ETIMEDOUT' ||
                               error.code === 'ERR_NETWORK' ||
                               error.message?.includes('Network Error');
      
      if (isTimeout) {
        return rejectWithValue({
          type: 'timeout',
          message: 'Syllabus parsing is taking longer than expected. The file is being processed in the background.',
          suggestion: 'Please check back in a few minutes or refresh the page to see if parsing completed.',
          originalError: error.message || 'Request timeout'
        });
      }
      
      if (isConnectionError) {
        return rejectWithValue({
          type: 'connection_error',
          message: 'Connection was interrupted, but processing may continue in the background.',
          suggestion: 'Please refresh the page in a few minutes to check if parsing completed.',
          originalError: error.message || 'Connection error'
        });
      }
      
      return rejectWithValue(
        error.response?.data?.message || error.message || 'Failed to upload syllabus'
      );
    }
  }
);

// Get class lectures IDs
export const getClassLecturesId = createAsyncThunk(
  "class/getClassLectures",
  async (_, { rejectWithValue }) => {
    try {
      const response = await ClassApi.getClassLecturesId();
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || error.message || 'Failed to fetch class lectures'
      );
    }
  }
);

// Update class
export const updateClass = createAsyncThunk(
  "class/updateClass",
  async ({ classId, classData }, { rejectWithValue }) => {
    try {
      const response = await ClassApi.updateClass(classId, classData);
      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || error.message || 'Failed to update class'
      );
    }
  }
);

// Delete class
export const deleteClass = createAsyncThunk(
  "class/deleteClass",
  async (classId, { rejectWithValue }) => {
    try {
      const response = await ClassApi.deleteClass(classId);
      return { classId, ...response.data };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || error.message || 'Failed to delete class'
      );
    }
  }
);

const classSlice = createSlice({
  name: "class",
  initialState,
  reducers: {
    clearCurrentClass: (state) => {
      state.currentClass = {};
    },
    clearError: (state) => {
      state.error = null;
    },
    updateCurrentClass: (state, action) => {
      // For optimistic updates
      if (state.currentClass._id === action.payload._id) {
        state.currentClass = { ...state.currentClass, ...action.payload };
      }
    },
    resetClassState: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      // Fetch Classes
      .addCase(fetchClasses.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchClasses.fulfilled, (state, action) => {
        state.loading = false;
        state.classes = action.payload.classes || [];
      })
      .addCase(fetchClasses.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || action.error.message;
      })
      // Create Class
      .addCase(createClass.pending, (state) => {
        state.createLoading = true;
        state.error = null;
      })
      .addCase(createClass.fulfilled, (state, action) => {
        state.createLoading = false;
        if (action.payload.class) {
          state.classes.unshift(action.payload.class);
        }
      })
      .addCase(createClass.rejected, (state, action) => {
        state.createLoading = false;
        state.error = action.payload || action.error.message;
      })
      // Get Class By ID
      .addCase(getClassById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getClassById.fulfilled, (state, action) => {
        state.loading = false;
        state.currentClass = action.payload.class || {};
        state.classes = state.classes.map((classItem) =>
          classItem._id === action.payload.class._id ? action.payload.class : classItem
        );
      })
      .addCase(getClassById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || action.error.message;
      })
      // Upload File
      .addCase(uploadFile.pending, (state) => {
        state.uploadLoading = true;
        state.error = null;
      })
      .addCase(uploadFile.fulfilled, (state, action) => {
        state.uploadLoading = false;
        // Update syllabus URL in current class
        if (action.payload.asset?.url && state.currentClass._id) {
          state.currentClass.syllabus = action.payload.asset.url;
        }
        // Also update in classes array if the class exists there
        const classIndex = state.classes.findIndex(
          cls => cls._id === state.currentClass._id
        );
        if (classIndex !== -1 && action.payload.asset?.url) {
          state.classes[classIndex].syllabus = action.payload.asset.url;
        }
      })
      .addCase(uploadFile.rejected, (state, action) => {
        state.uploadLoading = false;
        state.error = action.payload || action.error.message;
      })
      // Get Class Lectures ID
      .addCase(getClassLecturesId.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getClassLecturesId.fulfilled, (state, action) => {
        state.loading = false;
        state.classLectureId = action.payload?.data || [];
      })
      .addCase(getClassLecturesId.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || action.error.message;
      })
      // Update Class
      .addCase(updateClass.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateClass.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.class) {
          // Update in classes array
          const index = state.classes.findIndex(c => c._id === action.payload.class._id);
          if (index !== -1) {
            state.classes[index] = action.payload.class;
          }
          // Update current class if it's the same
          if (state.currentClass._id === action.payload.class._id) {
            state.currentClass = action.payload.class;
          }
        }
      })
      .addCase(updateClass.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || action.error.message;
      })
      // Delete Class
      .addCase(deleteClass.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteClass.fulfilled, (state, action) => {
        state.loading = false;
        // Remove from classes array
        state.classes = state.classes.filter(c => c._id !== action.payload.classId);
        // Clear current class if it was deleted
        if (state.currentClass._id === action.payload.classId) {
          state.currentClass = {};
        }
      })
      .addCase(deleteClass.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || action.error.message;
      });
  },
});

export const { 
  clearCurrentClass, 
  clearError, 
  updateCurrentClass, 
  resetClassState 
} = classSlice.actions;

export default classSlice.reducer;