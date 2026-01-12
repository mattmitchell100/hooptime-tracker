import React from 'react';
import { GameConfig, Player, PlayerStats } from '../types';
import { PageLayout } from './PageLayout';

type PostGameReportProps = {
  title: string;
  subtitle: string;
  printDate: string;
  config: GameConfig;
  roster: Player[];
  stats: PlayerStats[];
  aiAnalysis: string | null;
  isAnalyzing?: boolean;
  onAnalyze?: () => void;
  nav?: React.ReactNode;
  actions?: React.ReactNode;
};

const formatSeconds = (sec: number) => {
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const PostGameReport: React.FC<PostGameReportProps> = ({
  title,
  subtitle,
  printDate,
  config,
  roster,
  stats,
  aiAnalysis,
  isAnalyzing = false,
  onAnalyze,
  nav,
  actions
}) => {
  return (
    <PageLayout className="bg-slate-900 animate-in fade-in duration-500" contentClassName="space-y-8 report-container">
      <style>{`
        @media print {
          body { background: white !important; color: black !important; padding: 0 !important; margin: 0 !important; }
          .no-print { display: none !important; }
          .report-container { max-width: 100% !important; margin: 0 !important; padding: 1cm !important; }
          .report-table { border: 1px solid #000 !important; width: 100% !important; border-collapse: collapse !important; }
          .report-table th, .report-table td { border: 1px solid #000 !important; color: black !important; padding: 10px !important; }
          .ai-box { background: white !important; color: black !important; border: 1px solid #000 !important; }
          h1, h2, h3 { color: black !important; }
        }
      `}</style>

      <header className="space-y-4 border-b border-slate-800 pb-8 no-print">
        <div className="flex items-center justify-between gap-4">
          <img
            src="/pttrackr-logo.svg"
            alt="ptTRACKr"
            className="h-[44px] w-auto"
            onError={(event) => {
              event.currentTarget.style.display = 'none';
            }}
          />
          {nav ? <div className="flex items-center gap-2">{nav}</div> : null}
        </div>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-oswald text-white uppercase italic">{title}</h1>
            <p className="text-slate-400">{subtitle}</p>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </header>

      <div className="print-only hidden no-print:hidden">
        <h1 className="text-2xl font-bold mb-4">HoopTime Post-Game Analytics Report</h1>
        <p className="mb-8">{printDate} | {config.periodType} Format</p>
      </div>

      <section className="bg-slate-800 rounded-3xl overflow-hidden border border-slate-700 shadow-xl">
        <div className="bg-slate-700/50 px-8 py-5 border-b border-slate-700">
          <h2 className="text-xl font-oswald text-white uppercase">Total Minutes</h2>
        </div>
        <table className="w-full text-left report-table">
          <thead className="bg-slate-900/40 text-slate-400 text-xs uppercase">
            <tr>
              <th className="px-8 py-4">Player</th>
              {Array.from({ length: config.periodCount }).map((_, i) => (
                <th key={i} className="px-4 py-4 text-center">P{i + 1}</th>
              ))}
              <th className="px-8 py-4 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {roster.map(player => {
              const playerStats = stats.find(st => st.playerId === player.id);
              return (
                <tr key={player.id} className="text-slate-200">
                  <td className="px-8 py-5 flex items-center gap-3">
                    <span className="w-8 h-8 flex items-center justify-center bg-slate-700 rounded-full font-bold text-xs">
                      #{player.number}
                    </span>
                    <span className="font-bold">{player.name || '---'}</span>
                  </td>
                  {Array.from({ length: config.periodCount }).map((_, i) => (
                    <td key={i} className="px-4 py-5 text-center text-slate-400 tabular-nums">
                      {formatSeconds(playerStats?.periodMinutes[i + 1] || 0)}
                    </td>
                  ))}
                  <td className="px-8 py-5 text-right font-bold text-white tabular-nums">
                    {formatSeconds(playerStats?.totalMinutes || 0)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </PageLayout>
  );
};
