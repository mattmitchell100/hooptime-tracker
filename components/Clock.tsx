
import React from 'react';
import { PeriodType } from '../types';

interface ClockProps {
  seconds: number;
  isRunning: boolean;
  onToggle: () => void;
  onReset: () => void;
  period: number;
  periodType: PeriodType;
}

export const Clock: React.FC<ClockProps> = ({ seconds, isRunning, onToggle, onReset, period, periodType }) => {
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getLabel = () => {
    const type = periodType === 'Quarters' ? 'Quarter' : (periodType === 'Halves' ? 'Half' : 'Period');
    return `${type} ${period}`;
  };

  return (
    <div className="bg-slate-800 p-6 rounded-2xl shadow-xl border border-slate-700 flex flex-col items-center">
      <div className="text-sm font-bold text-orange-500 uppercase tracking-widest mb-2">{getLabel()}</div>
      <div className="text-7xl font-oswald text-white mb-6 tabular-nums">
        {formatTime(seconds)}
      </div>
      <div className="flex gap-4">
        <button
          onClick={onToggle}
          className={`px-8 py-3 rounded-full font-bold transition-all ${
            isRunning 
            ? 'bg-red-500 hover:bg-red-600 shadow-[0_0_20px_rgba(239,68,68,0.4)]' 
            : 'bg-emerald-500 hover:bg-emerald-600 shadow-[0_0_20px_rgba(16,185,129,0.4)]'
          }`}
        >
          {isRunning ? 'STOP' : 'START'}
        </button>
        <button
          onClick={onReset}
          className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-full font-bold text-slate-300 transition-colors"
        >
          RESET
        </button>
      </div>
    </div>
  );
};
