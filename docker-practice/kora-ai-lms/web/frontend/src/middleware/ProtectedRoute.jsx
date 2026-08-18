import React, { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

const ProtectedRoute = ({ children, publicOnly = false, requiredRole = null }) => {
  const { isLoggedIn, role } = useSelector((state) => state.auth);
  const location = useLocation();
  const navigate = useNavigate();

  // Redirect logged-in users away from public routes like login, forgot-password, and reset-password
  useEffect(() => {
    if (isLoggedIn && publicOnly) {
      const from = location.state?.from?.pathname;
      if (from) {
        navigate(from, { replace: true });
      } else if (role === 'student') {
        navigate('/student/dashboard', { replace: true });
      } else if (role === 'admin') {
        navigate('/admin/dashboard', { replace: true });
      }
    }
  }, [isLoggedIn, role, publicOnly, navigate, location.state]);

  // Redirect non-logged-in users from protected routes
  if (isLoggedIn === false && !publicOnly) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check role-based access for protected routes
  if (isLoggedIn && !publicOnly && requiredRole) {
    // If user doesn't have the required role for this route
    if (role !== requiredRole) {
      // Redirect to their respective dashboard based on their actual role
      if (role === 'student') {
        return <Navigate to="/student/dashboard" replace />;
      } else if (role === 'admin') {
        return <Navigate to="/admin/dashboard" replace />;
      }
    }
  }

  // Auto-redirect based on role if no specific route protection but user is logged in
  if (isLoggedIn && !publicOnly && !requiredRole) {
    // If user tries to access generic protected routes, redirect based on their role
    if (location.pathname === '/dashboard') {
      if (role === 'student') {
        return <Navigate to="/student/dashboard" replace />;
      } else if (role === 'admin') {
        return <Navigate to="/admin/dashboard" replace />;
      }
    }
  }

  return children;
};

export default ProtectedRoute;