import React from 'react';
import { Link } from 'react-router-dom';

const QuickActionCard = ({ title, icon, link }) => {
  return (
    <Link to={link} className="block">
      <div className="border rounded-lg p-6 text-center hover:shadow-md transition-shadow">
        <img 
          src={icon}
          alt={title} 
          className="w-12 h-12 mx-auto mb-3"
        />
        <p className="text-gray-700">{title}</p>
      </div>
    </Link>
  );
};

export default QuickActionCard; 