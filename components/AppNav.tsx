import React, { useEffect, useId, useRef, useState } from 'react';

type AppNavProps = {
  onManageRoster: () => void;
  onPastGames: () => void;
  historyCount?: number;
  isSignedIn: boolean;
  userLabel?: string;
  onSignIn: () => void;
  onSignOut: () => void;
  active?: 'history' | 'roster' | null;
};

const getMenuItemClass = (isActive: boolean) => (
  `w-full text-left px-4 py-2 text-sm font-semibold transition-colors ${
    isActive
      ? 'text-orange-300 bg-orange-500/10'
      : 'text-slate-200 hover:bg-slate-800'
  }`
);

export const AppNav: React.FC<AppNavProps> = ({
  onManageRoster,
  onPastGames,
  historyCount,
  isSignedIn,
  userLabel,
  onSignIn,
  onSignOut,
  active = null
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement | null>(null);
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
              aria-current={isRosterActive ? 'page' : undefined}
              onClick={() => handleMenuAction(onManageRoster)}
              className={getMenuItemClass(isRosterActive)}
            >
              Manage Roster
            </button>
            <button
              type="button"
              role="menuitem"
              aria-current={isHistoryActive ? 'page' : undefined}
              onClick={() => handleMenuAction(onPastGames)}
              className={getMenuItemClass(isHistoryActive)}
            >
              <span className="flex items-center justify-between">
                Past Games
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
                Sign Out
              </button>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => handleMenuAction(onSignIn)}
                className="w-full text-left px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/10 transition-colors"
              >
                Sign In
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
};
