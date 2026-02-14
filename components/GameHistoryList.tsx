import React from 'react';
import { GameHistoryEntry } from '../types';
import { formatPeriodDuration, formatGameTime } from '../utils/formatters';
import { Logo } from './Logo';
import { PageLayout } from './PageLayout';

type GameHistoryListProps = {
  entries: GameHistoryEntry[];
  onSelect: (entryId: string) => void;
  onDelete: (entryId: string) => void;
  headerActions?: React.ReactNode;
  headerCta?: React.ReactNode;
  banner?: React.ReactNode;
};

const formatDuration = (totalSeconds: number) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const formatTimestamp = (iso: string) => {
  const date = new Date(iso);
  const dateLabel = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const timeLabel = formatGameTime(date);

  return `${dateLabel} | ${timeLabel}`;
};

const getTeamLabel = (entry: GameHistoryEntry) => {
  if (!entry.teamSnapshot) return 'Unknown Team';
  return entry.teamSnapshot.name?.trim() || 'Unnamed Team';
};

const getTeamKey = (entry: GameHistoryEntry) => (
  entry.teamSnapshot?.id || getTeamLabel(entry)
);

const getOutcomeLabel = (outcome: GameHistoryEntry['outcome']) => (
  outcome === 'COMPLETE' ? 'Completed' : 'Ended Early'
);

const getOutcomeStyles = (outcome: GameHistoryEntry['outcome']) => (
  outcome === 'COMPLETE'
    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
    : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
);

export const GameHistoryList: React.FC<GameHistoryListProps> = ({
  entries,
  onSelect,
  onDelete,
  headerActions,
  headerCta,
  banner
}) => {
  const groupedEntries = React.useMemo(() => {
    const groupMap = new Map<string, { key: string; label: string; entries: GameHistoryEntry[] }>();

    entries.forEach((entry) => {
      const key = getTeamKey(entry);
      const label = getTeamLabel(entry);
      if (!groupMap.has(key)) {
        groupMap.set(key, { key, label, entries: [] });
      }
      groupMap.get(key)?.entries.push(entry);
    });

    const groups = Array.from(groupMap.values()).map((group) => {
      const sortedEntries = [...group.entries].sort(
        (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
      );
      return { ...group, entries: sortedEntries };
    });

    return groups.sort((a, b) => {
      const latestA = a.entries[0] ? new Date(a.entries[0].completedAt).getTime() : 0;
      const latestB = b.entries[0] ? new Date(b.entries[0].completedAt).getTime() : 0;
      return latestB - latestA;
    });
  }, [entries]);

  return (
    <PageLayout className="bg-slate-900 animate-in fade-in duration-500" contentClassName="space-y-8">
      <header className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Logo />
          <div className="flex items-center gap-2">
            {headerActions}
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-oswald text-white uppercase italic">My Games</h1>
          <p className="text-slate-400">Review past game sessions reports.</p>
          {headerCta ? (
            <div className="pt-2">
              {headerCta}
            </div>
          ) : null}
        </div>
      </header>

      {banner}

      <section className="space-y-6">
        {entries.length === 0 ? (
          <div className="bg-slate-800/60 border border-slate-700 rounded-3xl p-10 text-center">
            <h2 className="text-2xl font-oswald text-white uppercase italic mb-3">No games recorded yet</h2>
            <p className="text-slate-400">Finish a game or reset a session to build your history.</p>
          </div>
        ) : (
          groupedEntries.map(group => (
            <div key={group.key} className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-oswald text-white uppercase italic">{group.label}</h2>
                  <p className="text-sm text-slate-400">{group.entries.length} game{group.entries.length === 1 ? '' : 's'}</p>
                </div>
              </div>
              <div className="space-y-4">
                {group.entries.map(entry => {
                  const periodTypeLabel = entry.configSnapshot.periodCount === 1
                    ? (entry.configSnapshot.periodType === 'Halves' ? 'Half' : 'Quarter')
                    : (entry.configSnapshot.periodType === 'Halves' ? 'Halves' : 'Quarters');
                  const periodLabel = `${entry.configSnapshot.periodCount} ${periodTypeLabel} x ${formatPeriodDuration(entry.configSnapshot.periodMinutes, entry.configSnapshot.periodSeconds)}`;
                  const opponentName = entry.configSnapshot.opponentName?.trim();
                  const opponentLabel = opponentName ? `vs ${opponentName}` : 'Opponent TBD';
                  const teamLabel = getTeamLabel(entry);

                  return (
                    <div
                      key={entry.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelect(entry.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onSelect(entry.id);
                        }
                      }}
                      className="w-full text-left cursor-pointer group bg-slate-800/60 border border-slate-700 rounded-2xl p-6 hover:border-orange-500/60 hover:bg-slate-800 transition-colors"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <div className="space-y-2">
                          <div className="text-lg font-bold text-white">{formatTimestamp(entry.completedAt)}</div>
                          <div className="text-slate-400 text-sm">
                            {opponentLabel}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs font-bold uppercase tracking-wide">
                          <span className={`px-3 py-1 rounded-full ${getOutcomeStyles(entry.outcome)}`}>
                            {getOutcomeLabel(entry.outcome)}
                          </span>

                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onDelete(entry.id);
                            }}
                            className="px-3 py-1 rounded-full border border-red-500/40 text-red-300 hover:bg-red-500/10 transition-colors inline-flex items-center justify-center"
                            aria-label="Delete"
                            title="Delete"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                          <span className="text-slate-500 group-hover:text-slate-200 transition-colors">
                            View Report &gt;
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </section>
    </PageLayout>
  );
};
