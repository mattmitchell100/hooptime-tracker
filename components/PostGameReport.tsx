import React from 'react';
import { GameConfig, Player, PlayerStats } from '../types';
import { formatSeconds, formatPlayerName } from '../utils/formatters';
import { Logo } from './Logo';
import { PageLayout } from './PageLayout';

type PostGameReportProps = {
  title: string;
  subtitle: string;
  printDate: string;
  config: GameConfig;
  roster: Player[];
  stats: PlayerStats[];
  nav?: React.ReactNode;
  actions?: React.ReactNode;
};

export const PostGameReport: React.FC<PostGameReportProps> = ({
  title,
  subtitle,
  printDate,
  config,
  roster,
  stats,
  nav,
  actions
}) => {
  const periodShortLabel = config.periodType === 'Halves' ? 'H' : 'Q';
  return (
    <>
      <style>{`
        @media print {
          body { background: white !important; color: black !important; padding: 0 !important; margin: 0 !important; }
          .no-print { display: none !important; }
          .report-container { max-width: 100% !important; margin: 0 !important; padding: 1cm !important; }
          .report-table { border: 1px solid #000 !important; width: 100% !important; border-collapse: collapse !important; }
          .report-table th, .report-table td { border: 1px solid #000 !important; color: black !important; padding: 10px !important; }
          h1, h2, h3 { color: black !important; }
        }
      `}</style>
      <PageLayout className="bg-slate-900 animate-in fade-in duration-500" contentClassName="space-y-8 report-container">
        <header className="space-y-4 border-b border-slate-800 pb-8 no-print">
        <div className="flex items-center justify-between gap-4">
          <Logo />
          {nav ? <div className="flex items-center gap-2">{nav}</div> : null}
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-oswald text-white uppercase italic">{title}</h1>
            <p className="text-slate-400 w-full">{subtitle}</p>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2 justify-between">{actions}</div> : null}
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
        <div className="overflow-x-auto">
          <table className="min-w-max w-full text-left report-table">
            <thead className="bg-slate-900/40 text-slate-400 text-xs uppercase">
              <tr>
                <th className="sticky left-0 z-20 bg-slate-900 px-4 py-3 text-left whitespace-nowrap">Player</th>
                {Array.from({ length: config.periodCount }).map((_, i) => (
                  <th key={i} className="px-2 py-3 text-center whitespace-nowrap">{periodShortLabel}{i + 1}</th>
                ))}
                <th className="px-4 py-3 text-right whitespace-nowrap">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {roster.map(player => {
                const playerStats = stats.find(st => st.playerId === player.id);
                return (
                  <tr key={player.id} className="text-slate-200">
                    <td className="sticky left-0 z-10 bg-slate-800 px-4 py-3">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <span className="inline-flex w-8 h-8 shrink-0 items-center justify-center bg-slate-700 rounded-full aspect-square font-bold text-xs leading-none">
                          #{player.number}
                        </span>
                        <span className="font-bold">{formatPlayerName(player.name)}</span>
                      </div>
                    </td>
                    {Array.from({ length: config.periodCount }).map((_, i) => (
                      <td key={i} className="px-2 py-3 text-center text-slate-400 tabular-nums whitespace-nowrap">
                        {formatSeconds(playerStats?.periodMinutes[i + 1] || 0)}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right font-bold text-white tabular-nums whitespace-nowrap">
                      {formatSeconds(playerStats?.totalMinutes || 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      </PageLayout>
    </>
  );
};
