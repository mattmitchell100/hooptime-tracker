import React from 'react';
import { Logo } from './Logo';
import { PageLayout } from './PageLayout';

type LandingPageProps = {
  primaryLabel: string;
  onPrimaryAction: () => void;
  helperText?: string | null;
};

export const LandingPage: React.FC<LandingPageProps> = ({
  primaryLabel,
  onPrimaryAction,
  helperText = null
}) => (
  <PageLayout contentClassName="flex flex-col justify-center">
    <div className="mb-10 space-y-8">
      <div className="flex items-center gap-4">
        <Logo className="h-[64px] w-auto" />
      </div>
      <div className="bg-slate-800/50 border border-slate-700 rounded-3xl p-8 space-y-8">
        <div className="grid gap-8 lg:grid-cols-[1.1fr,0.9fr] items-center">
          <div className="space-y-6">
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Game-day rotation tracker</p>
              <h1 className="text-4xl md:text-5xl font-oswald text-white uppercase italic leading-tight">
                Plan. Track. Report.
              </h1>
              <p className="text-lg text-slate-400">
                Set the game format, manage your roster, and capture AI insights after every session.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={onPrimaryAction}
                className="px-6 py-4 bg-orange-600 hover:bg-orange-500 text-white rounded-2xl font-bold uppercase tracking-wide text-sm shadow-lg shadow-orange-500/20 transition-all"
              >
                {primaryLabel}
              </button>
            </div>
            {helperText ? (
              <p className="text-xs text-slate-500">{helperText}</p>
            ) : null}
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 px-5 py-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Quick Start</p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-slate-200">
                  <span className="h-7 w-7 rounded-full bg-orange-500/10 text-orange-300 flex items-center justify-center font-bold text-xs">1</span>
                  Configure periods, opponent, and team.
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-200">
                  <span className="h-7 w-7 rounded-full bg-orange-500/10 text-orange-300 flex items-center justify-center font-bold text-xs">2</span>
                  Select starters and track rotations live.
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-200">
                  <span className="h-7 w-7 rounded-full bg-orange-500/10 text-orange-300 flex items-center justify-center font-bold text-xs">3</span>
                  Export reports with AI insights after the game.
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-900/50 px-5 py-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Built For</p>
              <div className="flex flex-wrap gap-2 text-xs text-slate-400 uppercase tracking-wide">
                <span className="px-3 py-1 rounded-full bg-slate-800">Coaches</span>
                <span className="px-3 py-1 rounded-full bg-slate-800">Assistants</span>
                <span className="px-3 py-1 rounded-full bg-slate-800">Parents</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </PageLayout>
);
