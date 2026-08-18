import React from 'react';
import { Link } from 'react-router-dom';

const NotFound = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <h1 className="text-9xl font-bold text-gray-800">404</h1>
        <h2 className="text-2xl font-semibold text-gray-600 mt-4">Page Not Found</h2>
        <p className="text-gray-500 mt-2 mb-6">
          Sorry, the page you are looking for doesn't exist.
        </p>
        <Link 
          to="/student/dashboard" 
          className="bg-[linear-gradient(90deg,rgba(0,174,236,0.93),rgba(0,110,158,1))] text-white px-6 py-3 rounded-lg hover:opacity-90 transition-opacity"
        >
          Go Back Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
