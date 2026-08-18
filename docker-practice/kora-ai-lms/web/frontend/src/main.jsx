import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import store from "./store/store.js";
import { Provider } from "react-redux";
import { RouterProvider, createBrowserRouter, Outlet, Navigate } from "react-router-dom";
import {
  Login,
  Signup,
  ForgetPassword,
  ResetPassword,
  NotFound,
} from "./pages/Auth";
import ProtectedRoute from "./middleware/ProtectedRoute.jsx";
import {
  CalendarPage,
  ClassDetailsPage,
  LecturePage,
  MyClassesPage,
  NotificationsPage,
  SettingsPage,
  StudyPage,
  UploadLecturePage,
  StudentDashboardPage,
  ComprehensionAssessmentPage,
  FlashcardsPage,
  PracticeQuizPage,
  StudyGuidePage,
  ProfilePage,
  SubscriptionPage,
  Payment,
} from "./pages/Student";
import TestPayment from "./pages/Student/TestPayment.jsx";
import { attachAxiosInterceptors } from "./config/axios.js";
import {
  Dashboard,
  Integrations,
  LectureProcessing,
  Payments,
  Promocodes,
  ReferenceCodes,
} from "./pages/Admin";
import AuthSuccessHandler from "./components/AuthSuccessHandler.jsx";
import Dashboardlayout from "./components/Dashboardlayout.jsx";
import UploadDocument from "./pages/Student/UploadDocument.jsx";
import DocumentProgress from "./pages/Student/DocumentProgress.jsx";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      {
        index: true,
        element: <Navigate to="/login" replace />,
      },
      {
        path: "/login",
        element: (
          <ProtectedRoute publicOnly>
            <Login />
          </ProtectedRoute>
        ),
      },
      {
        path: "/signup",
        element: (
          <ProtectedRoute publicOnly>
            <Signup />
          </ProtectedRoute>
        ),
      },
      {
        path: "/forgot-password",
        element: (
          <ProtectedRoute publicOnly>
            <ForgetPassword />
          </ProtectedRoute>
        ),
      },
      {
        path: "/reset-password/:token",
        element: (
          <ProtectedRoute publicOnly>
            <ResetPassword />
          </ProtectedRoute>
        ),
      },
      {
        path: "/auth/success",
        element: (
          <ProtectedRoute publicOnly>
            <AuthSuccessHandler />
          </ProtectedRoute>
        ),
      },
      {
        path: "/student",
        element: (
          <ProtectedRoute requiredRole="student">
            <Dashboardlayout />
          </ProtectedRoute>
        ),
        children: [
          { path: "dashboard", element: <StudentDashboardPage /> },
          { path: "calendar", element: <CalendarPage /> },
          { path: "my-classes", element: <MyClassesPage /> },
          { path: "my-classes/:classId", element: <ClassDetailsPage /> },
          { path: "my-classes/:classId/:lectureId", element: <LecturePage /> },
          { path: "study", element: <StudyPage /> },
          { path: "study/practice-quiz", element: <PracticeQuizPage /> },
          { path: "study/flashcards", element: <FlashcardsPage /> },
          { path: "study/study-guide", element: <StudyGuidePage /> },
          {
            path: "study/comprehension-assessment",
            element: <ComprehensionAssessmentPage />,
          },
          { path: "upload-lecture", element: <UploadLecturePage /> },
          { path: "settings", element: <SettingsPage /> },
          { path: "notifications", element: <NotificationsPage /> },
          { path: "profile", element: <ProfilePage /> },
          { path: "subscribe", element: <SubscriptionPage /> },
          // New Upload Doc 
          { path: "upload-document", element: <UploadDocument /> },
          { path: "my-classes/:classId/generate-notes", element: <DocumentProgress /> },
         
        ],
      },
      {
        path: "/payment",
        element: (
          <ProtectedRoute requiredRole="student">
            <Payment />
          </ProtectedRoute>
        ),
      },
      {
        path: "/test-payment",
        element: (
          <ProtectedRoute requiredRole="student">
            <TestPayment />
          </ProtectedRoute>
        ),
      },

      {
        path: "/admin/login",
        element: (
          <ProtectedRoute publicOnly>
            <Login />
          </ProtectedRoute>
        ),
      },
      {
        path: "/admin",
        element: (
          <ProtectedRoute requiredRole="admin">
            <Outlet />
          </ProtectedRoute>
        ),
        children: [
          { path: "dashboard", element: <Dashboard /> },
          { path: "lectures", element: <LectureProcessing /> },
          { path: "integrations", element: <Integrations /> },
          { path: "payments", element: <Payments /> },
          { path: "promocodes", element: <Promocodes /> },
          { path: "reference-codes", element: <ReferenceCodes /> },
        ],
      },

      { path: "*", element: <NotFound /> },
    ],
  },
]);

attachAxiosInterceptors(store);
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  </StrictMode>,
);
