import React from 'react';

interface StatusBadgeProps {
  active: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ active }) => {
  return (
    <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${
      active 
        ? 'bg-green-500/10 border-green-500/20 text-green-400' 
        : 'bg-gray-800 border-gray-700 text-gray-400'
    }`}>
      <span className={`relative flex h-2.5 w-2.5`}>
        {active && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
        )}
        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${active ? 'bg-green-500' : 'bg-gray-500'}`}></span>
      </span>
      <span className="text-sm font-mono font-medium tracking-wide">
        {active ? 'LIVE BROADCAST' : 'OFFLINE'}
      </span>
    </div>
  );
};