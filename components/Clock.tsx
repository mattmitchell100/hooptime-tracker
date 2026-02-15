
import React from 'react';
import { PeriodType } from '../types';

interface ClockProps {
  seconds: number;
  isRunning: boolean;
  onToggle: () => void;
  onPrevPeriod: () => void;
  onNextPeriod: () => void;
  onAdjustSeconds: (delta: number) => void;
  nextLabel: string;
  period: number;
  periodCount: number;
  periodType: PeriodType;
}

export const Clock: React.FC<ClockProps> = ({
  seconds,
  isRunning,
  onToggle,
  onPrevPeriod,
  onNextPeriod,
  onAdjustSeconds,
  nextLabel,
  period,
  periodCount,
  periodType
}) => {
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getLabel = () => {
    const type = periodType === 'Quarters' ? 'Quarter' : (periodType === 'Halves' ? 'Half' : 'Period');
    return `${type} ${period}`;
  };

  const canGoPrev = period > 1;
  const canGoNext = period < periodCount;
  const isFinalPeriodComplete = period === periodCount && seconds === 0;
  const navLabel = periodType === 'Halves' ? 'Half' : 'Quarter';

  const canAdjust = !isRunning;

  return (
    <div className="bg-slate-800 p-4 rounded-2xl shadow-xl border border-slate-700 flex flex-col items-center min-w-[275px]">
      <div className="text-sm font-bold text-orange-500 uppercase tracking-widest mb-2">{getLabel()}</div>
      <div className="flex items-center justify-center gap-2 mb-3" aria-hidden="true">
        {Array.from({ length: periodCount }).map((_, index) => {
          const isActive = index + 1 === period;
          return (
            <span
              key={`period-dot-${index}`}
              className={`h-2 w-2 rounded-full ${isActive ? 'bg-orange-500' : 'bg-slate-600/70'}`}
            />
          );
        })}
      </div>
      <div className="flex justify-center items-center mb-6 gap-4">
        <div className="text-7xl font-oswald text-white tabular-nums w-[175px] text-center shrink-0">
          {formatTime(seconds)}
        </div>
        <div className="flex flex-col border border-slate-700 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => onAdjustSeconds(1)}
            disabled={!canAdjust}
            aria-label="Add one second"
            title="Add one second"
            className={`px-3 py-2 transition-colors ${
              canAdjust
                ? 'bg-slate-900 text-slate-200 hover:bg-slate-700'
                : 'bg-slate-900 text-slate-600 cursor-not-allowed'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <div className="h-px bg-slate-700" />
          <button
            type="button"
            onClick={() => onAdjustSeconds(-1)}
            disabled={!canAdjust}
            aria-label="Subtract one second"
            title="Subtract one second"
            className={`px-3 py-2 transition-colors ${
              canAdjust
                ? 'bg-slate-900 text-slate-200 hover:bg-slate-700'
                : 'bg-slate-900 text-slate-600 cursor-not-allowed'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>
      <div className="w-full">
        <button
          onClick={onToggle}
          disabled={isFinalPeriodComplete}
          className={`w-full px-8 py-3 rounded-full font-bold transition-all flex items-center justify-center gap-2 ${
            isFinalPeriodComplete
              ? 'bg-slate-700 text-slate-200 cursor-not-allowed'
              : (isRunning
                ? 'bg-red-500 hover:bg-red-600 shadow-[0_0_20px_rgba(239,68,68,0.4)]'
                : 'bg-emerald-500 hover:bg-emerald-600 shadow-[0_0_20px_rgba(16,185,129,0.4)]')
          }`}
        >
          {isFinalPeriodComplete && (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          {isFinalPeriodComplete ? 'Game Complete' : (isRunning ? 'STOP' : 'START')}
        </button>
        <div className="grid grid-cols-2 divide-x divide-slate-700 rounded-full border border-slate-700 overflow-hidden w-full mt-3">
          <button
            type="button"
            onClick={onPrevPeriod}
            disabled={!canGoPrev}
            aria-label={`Previous ${navLabel}`}
            title={`Previous ${navLabel}`}
            className={`py-2.5 flex items-center justify-center transition-colors ${
              canGoPrev
                ? 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                : 'bg-slate-900 text-slate-600 cursor-not-allowed'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onNextPeriod}
            disabled={!canGoNext}
            aria-label={nextLabel}
            title={nextLabel}
            className={`py-2.5 transition-colors flex items-center justify-center ${
              canGoNext
                ? 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                : 'bg-slate-900 text-slate-600 cursor-not-allowed'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
