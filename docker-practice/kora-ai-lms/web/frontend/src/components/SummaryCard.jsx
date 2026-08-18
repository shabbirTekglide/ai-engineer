import React from 'react';

const SummaryCard = ({ title, value, Icon }) => {
  return (
    <div className="border rounded-lg p-4">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-gray-600 mb-2">{title}</p>
          <p className="text-3xl font-bold">{value}</p>
        </div>
        <Icon className="text-6xl text-gray-400" />
      </div>
    </div>
  );
};

export default SummaryCard; 