import React, { useEffect, useId, useRef, useState } from 'react';

type SyncTone = 'neutral' | 'success' | 'warning' | 'error';

type SyncStatus = {
  label: string;
  detail?: string;
  tone?: SyncTone;
};

type AppNavProps = {
  onGameSetup: () => void;
  onManageRoster: () => void;
  onPastGames: () => void;
  historyCount?: number;
  isSignedIn: boolean;
  userLabel?: string;
  onSignIn: () => void;
  onSignOut: () => void;
  active?: 'config' | 'history' | 'roster' | null;
  syncStatus?: SyncStatus;
};

const getMenuItemClass = (isActive: boolean) => (
  `w-full text-left px-4 py-2 text-sm font-semibold transition-colors ${
    isActive
      ? 'text-orange-300 bg-orange-500/10'
      : 'text-slate-200 hover:bg-slate-800'
  }`
);

const getSyncToneClass = (tone: SyncTone = 'neutral') => {
  switch (tone) {
    case 'success':
      return 'text-emerald-300';
    case 'warning':
      return 'text-amber-300';
    case 'error':
      return 'text-red-300';
    default:
      return 'text-slate-400';
  }
};

export const AppNav: React.FC<AppNavProps> = ({
  onGameSetup,
  onManageRoster,
  onPastGames,
  historyCount,
  isSignedIn,
  userLabel,
  onSignIn,
  onSignOut,
  active = null,
  syncStatus
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isConfigActive = active === 'config';
  const isHistoryActive = active === 'history';
  const isRosterActive = active === 'roster';
  const accountLabel = userLabel?.trim() || 'Account';
  const triggerLabel = isSignedIn ? accountLabel : 'Menu';

  useEffect(() => {
    if (!isMenuOpen) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setIsMenuOpen(false);
      }
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isMenuOpen]);

  const handleMenuAction = (action: () => void) => {
    action();
    setIsMenuOpen(false);
  };

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setIsMenuOpen(prev => !prev)}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          aria-controls={menuId}
          title={triggerLabel}
          className={`flex items-center justify-center w-11 h-11 rounded-xl border transition-colors ${
            isMenuOpen
              ? 'border-orange-500/60 bg-orange-500/10 text-orange-200'
              : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span className="sr-only">{triggerLabel}</span>
        </button>
        {isMenuOpen && (
          <div
            id={menuId}
            role="menu"
            className="absolute right-0 mt-2 w-52 rounded-xl border border-slate-700 bg-slate-900/95 backdrop-blur-md shadow-xl z-50 overflow-hidden"
          >
            <button
              type="button"
              role="menuitem"
              aria-current={isConfigActive ? 'page' : undefined}
              onClick={() => handleMenuAction(onGameSetup)}
              className={getMenuItemClass(isConfigActive)}
            >
              <span className="flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Game
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              aria-current={isRosterActive ? 'page' : undefined}
              onClick={() => handleMenuAction(onManageRoster)}
              className={getMenuItemClass(isRosterActive)}
            >
              <span className="flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Manage Roster
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              aria-current={isHistoryActive ? 'page' : undefined}
              onClick={() => handleMenuAction(onPastGames)}
              className={getMenuItemClass(isHistoryActive)}
            >
              <span className="flex items-center justify-between">
                <span className="flex items-center gap-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  My Games
                </span>
                {typeof historyCount === 'number' && (
                  <span className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded-full text-xs">
                    {historyCount}
                  </span>
                )}
              </span>
            </button>
            <div className="border-t border-slate-800 my-1" />
            {isSignedIn ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => handleMenuAction(onSignOut)}
                className="w-full text-left px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/10 transition-colors"
              >
                <span className="flex items-center gap-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign Out
                </span>
              </button>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => handleMenuAction(onSignIn)}
                className="w-full text-left px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/10 transition-colors"
              >
                <span className="flex items-center gap-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  Sign In
                </span>
              </button>
            )}
            {syncStatus ? (
              <div className="border-t border-slate-800 px-4 py-2">
                <div className={`text-xs font-semibold uppercase tracking-wide ${getSyncToneClass(syncStatus.tone)}`}>
                  {syncStatus.label}
                </div>
                {syncStatus.detail ? (
                  <div className="mt-1 text-xs text-slate-500">
                    {syncStatus.detail}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
};
