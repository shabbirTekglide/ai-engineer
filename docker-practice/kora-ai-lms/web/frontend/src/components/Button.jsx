import React from 'react'

 function Button({ children, className, onClick }) {
    return (
      <button
        onClick={onClick}
        className={`px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg transition-colors duration-200 hover:bg-blue-500 hover:text-white hover:border-blue-500 ${className}`}
      >
        {children}
      </button>
    );
  }
  
  export default Button