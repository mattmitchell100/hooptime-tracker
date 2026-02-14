
import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { Player, PlayerStats, GameState, GameConfig, DEFAULT_CONFIG, GameHistoryEntry, GameHistoryOutcome, Team, TeamSnapshot } from './types';
import { AuthModal } from './components/AuthModal';
import { AppNav } from './components/AppNav';
import { Clock } from './components/Clock';
import { GameHistoryList } from './components/GameHistoryList';
import { LandingPage } from './components/LandingPage';
import { Logo } from './components/Logo';
import { PageLayout, PAGE_PADDING_X, PAGE_PADDING_Y } from './components/PageLayout';
import { PostGameReport } from './components/PostGameReport';
import { SubstitutionModal } from './components/SubstitutionModal';
import {
  deleteHistoryEntry,
  fetchUserHistory,
  fetchUserTeams,
  saveHistoryEntry,
  saveUserTeams,
  signInWithEmail,
  signInWithGoogle,
  signOutUser,
  signUpWithEmail,
  subscribeToAuth,
  subscribeToUserTeams,
  supabaseEnabled
} from './services/supabase';
import { analyzeRotation } from './services/geminiService';
import { formatSeconds, formatPlayerName } from './utils/formatters';

const STORAGE_KEY = 'hooptime_tracker_v1';
const HISTORY_STORAGE_KEY = 'hooptime_history_v1';
const TEAMS_STORAGE_KEY = 'hooptime_teams_v1';
const HISTORY_LIMIT = 20;
const DEFAULT_TEAM_NAME = 'Team 1';
const CONFIG_VERSION = 2;
const LEGACY_DEFAULT_CONFIG: GameConfig = {
  periodCount: 4,
  periodMinutes: 7,
  periodSeconds: 30,
  periodType: 'Quarters',
  opponentName: ''
};
const VALID_PERIOD_SECONDS = new Set([0, 15, 30, 45]);

const normalizeConfig = (incoming?: Partial<GameConfig> | null): GameConfig => {
  const base = { ...DEFAULT_CONFIG, ...(incoming || {}) };
  const periodMinutes = Number.isFinite(base.periodMinutes)
    ? Math.min(15, Math.max(1, Math.round(base.periodMinutes)))
    : DEFAULT_CONFIG.periodMinutes;
  const periodSeconds = VALID_PERIOD_SECONDS.has(base.periodSeconds)
    ? base.periodSeconds
    : DEFAULT_CONFIG.periodSeconds;
  const periodCount = Number.isFinite(base.periodCount) && base.periodCount > 0
    ? Math.round(base.periodCount)
    : DEFAULT_CONFIG.periodCount;
  const periodType = base.periodType === 'Halves' || base.periodType === 'Quarters'
    ? base.periodType
    : DEFAULT_CONFIG.periodType;
  const opponentName = typeof base.opponentName === 'string' ? base.opponentName : '';

  return {
    ...base,
    periodCount,
    periodMinutes,
    periodSeconds,
    periodType,
    opponentName
  };
};

const normalizeTeamSnapshot = (entry: GameHistoryEntry): TeamSnapshot => {
  if (!entry?.teamSnapshot) {
    return { id: 'unknown', name: 'Unknown Team' };
  }

  const name = typeof entry.teamSnapshot.name === 'string' && entry.teamSnapshot.name.trim()
    ? entry.teamSnapshot.name
    : 'Unnamed Team';
  const id = typeof entry.teamSnapshot.id === 'string' && entry.teamSnapshot.id
    ? entry.teamSnapshot.id
    : 'unknown';
  return { id, name };
};

const normalizeHistoryEntry = (entry: GameHistoryEntry): GameHistoryEntry => ({
  ...entry,
  configSnapshot: {
    ...DEFAULT_CONFIG,
    ...(entry?.configSnapshot || {}),
    opponentName: entry?.configSnapshot?.opponentName ?? ''
  },
  teamSnapshot: normalizeTeamSnapshot(entry)
});

const sortHistoryEntries = (entries: GameHistoryEntry[]) => (
  [...entries].sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
);

const mergeHistoryEntries = (primary: GameHistoryEntry[], secondary: GameHistoryEntry[]) => {
  const merged = new Map<string, GameHistoryEntry>();
  [...primary, ...secondary].forEach((entry) => {
    if (entry?.id) {
      merged.set(entry.id, normalizeHistoryEntry(entry));
    }
  });
  return sortHistoryEntries(Array.from(merged.values())).slice(0, HISTORY_LIMIT);
};

const readHistoryFromStorage = (): GameHistoryEntry[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => normalizeHistoryEntry(entry as GameHistoryEntry));
  } catch (error) {
    console.error('Failed to parse saved history', error);
    return [];
  }
};

const writeHistoryToStorage = (entries: GameHistoryEntry[]) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
  } catch (error) {
    console.error('Failed to persist history', error);
  }
};

const generateHistoryId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `history-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

const generateId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

const createPlayer = (): Player => ({
  id: generateId('player'),
  name: '',
  number: ''
});

const createTeam = (name: string, players: Player[] = []): Team => ({
  id: generateId('team'),
  name,
  players
});

const getNextTeamName = (teams: Team[]) => {
  const existing = new Set(teams.map(team => team.name.trim().toLowerCase()).filter(Boolean));
  let index = 1;
  while (existing.has(`team ${index}`)) {
    index += 1;
  }
  return `Team ${index}`;
};

const normalizePlayer = (player: Partial<Player> | null | undefined): Player => ({
  id: typeof player?.id === 'string' ? player.id : generateId('player'),
  name: typeof player?.name === 'string' ? player.name : '',
  number: typeof player?.number === 'string' ? player.number : ''
});

const normalizeTeam = (team: Partial<Team> | null | undefined): Team => ({
  id: typeof team?.id === 'string' ? team.id : generateId('team'),
  name: typeof team?.name === 'string' && team.name.trim() ? team.name : DEFAULT_TEAM_NAME,
  players: Array.isArray(team?.players) ? team.players.map(player => normalizePlayer(player)) : []
});

const getPeriodLabels = (periodType: GameConfig['periodType']) => {
  const singular = periodType === 'Halves' ? 'Half' : 'Quarter';
  const plural = periodType === 'Halves' ? 'Halves' : 'Quarters';
  const short = periodType === 'Halves' ? 'H' : 'Q';
  return { singular, plural, short };
};

const readTeamsFromStorage = () => {
  if (typeof window === 'undefined') {
    return { teams: [], selectedTeamId: null as string | null };
  }
  try {
    const stored = localStorage.getItem(TEAMS_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;
    if (!parsed) {
      return { teams: [], selectedTeamId: null as string | null };
    }
    const teams = Array.isArray(parsed.teams)
      ? parsed.teams.map((team: Team) => normalizeTeam(team))
      : [];
    const selectedTeamId = typeof parsed.selectedTeamId === 'string' ? parsed.selectedTeamId : null;
    return { teams, selectedTeamId };
  } catch (error) {
    console.error('Failed to parse saved teams', error);
    return { teams: [], selectedTeamId: null as string | null };
  }
};

const writeTeamsToStorage = (teams: Team[], selectedTeamId: string | null) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TEAMS_STORAGE_KEY, JSON.stringify({ teams, selectedTeamId }));
  } catch (error) {
    console.error('Failed to persist teams', error);
  }
};

type SetupPhase = 'CONFIG' | 'STARTERS' | 'GAME';
type HistoryView = 'LIST' | 'DETAIL';
type TeamSyncState = 'disabled' | 'signedOut' | 'loading' | 'saving' | 'saved' | 'error';
type ConfirmTone = 'warning' | 'danger';
type ConfirmAction =
  | { type: 'NEXT_PERIOD' }
  | { type: 'PREV_PERIOD' }
  | { type: 'END_GAME' }
  | { type: 'DELETE_TEAM'; teamId: string }
  | { type: 'DELETE_HISTORY'; entryId: string };
type ConfirmState = {
  title: string;
  message: string;
  confirmLabel: string;
  tone: ConfirmTone;
  action: ConfirmAction;
};

const App: React.FC = () => {
  // --- STATE INITIALIZATION ---
  const [isHydrated, setIsHydrated] = useState(false);
  const [phase, setPhase] = useState<SetupPhase>('CONFIG');
  const [config, setConfig] = useState<GameConfig>(DEFAULT_CONFIG);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [onCourtIds, setOnCourtIds] = useState<string[]>([]);
  const [stats, setStats] = useState<PlayerStats[]>([]);
  const [history, setHistory] = useState<GameHistoryEntry[]>([]);
  const [historyView, setHistoryView] = useState<HistoryView | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [isRosterViewOpen, setIsRosterViewOpen] = useState(false);
  const [showLanding, setShowLanding] = useState(true);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [teamSyncState, setTeamSyncState] = useState<TeamSyncState>(
    supabaseEnabled ? 'signedOut' : 'disabled'
  );
  const [teamSyncAt, setTeamSyncAt] = useState<string | null>(null);
  const [teamSyncError, setTeamSyncError] = useState<string | null>(null);
  const [isGameComplete, setIsGameComplete] = useState(false);
  const [isResetting, setIsResetting] = useState(false); // Custom confirmation state
  const [isPeriodSettingsOpen, setIsPeriodSettingsOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [periodDraft, setPeriodDraft] = useState({
    periodCount: DEFAULT_CONFIG.periodCount,
    periodMinutes: DEFAULT_CONFIG.periodMinutes,
    periodSeconds: DEFAULT_CONFIG.periodSeconds,
    periodType: DEFAULT_CONFIG.periodType
  });
  const [gameState, setGameState] = useState<GameState>({
    currentPeriod: 1,
    remainingSeconds: (DEFAULT_CONFIG.periodMinutes * 60) + DEFAULT_CONFIG.periodSeconds,
    isRunning: false,
    onCourtIds: [],
    lastClockUpdate: null,
  });

  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isResumeBannerClosed, setIsResumeBannerClosed] = useState(false);
  const [expiredPeriods, setExpiredPeriods] = useState<number[]>([]);

  const timerRef = useRef<number | null>(null);
  const hasArchivedCurrentGame = useRef(false);
  const previousRemainingSecondsRef = useRef(gameState.remainingSeconds);
  const historyRef = useRef<GameHistoryEntry[]>([]);
  const previousTeamIdRef = useRef<string | null>(null);
  const isTeamSyncReadyRef = useRef(false);
  const isApplyingRemoteTeamsRef = useRef(false);
  const lastTeamsSyncRef = useRef<string | null>(null);
  const hasRoutedOnAuthRef = useRef(false);
  const rosterListRef = useRef<HTMLDivElement | null>(null);

  const selectedTeam = teams.find(team => team.id === selectedTeamId) || teams[0] || null;
  const roster = selectedTeam?.players ?? [];
  const selectedTeamLabel = selectedTeam?.name?.trim() || 'Unnamed Team';
  const opponentName = config.opponentName.trim();
  const selectionSummary = opponentName
    ? `${selectedTeamLabel} V ${opponentName}`
    : selectedTeamLabel;
  const periodLabels = getPeriodLabels(config.periodType);
  const periodLabel = periodLabels.singular;
  const periodLabelShort = periodLabels.short;
  const periodLabelLower = periodLabel.toLowerCase();
  const hasResumeSession = !isGameComplete && (phase === 'STARTERS' || phase === 'GAME');

  // --- PERSISTENCE ---
  useEffect(() => {
    const storedTeamsState = readTeamsFromStorage();
    let nextTeams = storedTeamsState.teams;
    let nextSelectedTeamId = storedTeamsState.selectedTeamId;
    let nextPhase: SetupPhase = 'CONFIG';

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const savedPhase = parsed.phase;
        if (savedPhase === 'ROSTER') {
          nextPhase = 'CONFIG';
        } else if (savedPhase === 'CONFIG' || savedPhase === 'STARTERS' || savedPhase === 'GAME') {
          nextPhase = savedPhase;
        } else {
          nextPhase = 'CONFIG';
        }
        const savedConfigVersion = typeof parsed.configVersion === 'number' ? parsed.configVersion : 1;
        const mergedConfig = { ...DEFAULT_CONFIG, ...parsed.config };
        const normalizedConfig = normalizeConfig(mergedConfig);
        const isLegacyDefaults = savedConfigVersion < CONFIG_VERSION
          && mergedConfig.periodCount === LEGACY_DEFAULT_CONFIG.periodCount
          && mergedConfig.periodMinutes === LEGACY_DEFAULT_CONFIG.periodMinutes
          && mergedConfig.periodSeconds === LEGACY_DEFAULT_CONFIG.periodSeconds
          && mergedConfig.periodType === LEGACY_DEFAULT_CONFIG.periodType
          && (!mergedConfig.opponentName || !mergedConfig.opponentName.trim());

        setConfig(isLegacyDefaults ? DEFAULT_CONFIG : normalizedConfig);
        if (Array.isArray(parsed.expiredPeriods)) {
          setExpiredPeriods(parsed.expiredPeriods.filter((value: unknown) => typeof value === 'number'));
        }
        setOnCourtIds(parsed.onCourtIds || []);
        setStats(parsed.stats || []);
        setIsGameComplete(parsed.isGameComplete || false);
        setAiAnalysis(parsed.aiAnalysis || null);
        if (parsed.gameState) {
          setGameState({
            ...parsed.gameState,
            isRunning: false
          });
        }

        if (!nextTeams.length) {
          if (Array.isArray(parsed.teams)) {
            nextTeams = parsed.teams.map((team: Team) => normalizeTeam(team));
          } else if (Array.isArray(parsed.roster)) {
            const migratedPlayers = parsed.roster.map((player: Player) => normalizePlayer(player));
            nextTeams = [createTeam(DEFAULT_TEAM_NAME, migratedPlayers)];
          }
        }

        if (!nextSelectedTeamId && typeof parsed.selectedTeamId === 'string') {
          nextSelectedTeamId = parsed.selectedTeamId;
        }
      } catch (e) {
        console.error('Failed to recover session', e);
      }
    }

    if (!nextTeams.length) {
      nextTeams = [createTeam(DEFAULT_TEAM_NAME, [])];
    }

    if (!nextSelectedTeamId || !nextTeams.some(team => team.id === nextSelectedTeamId)) {
      nextSelectedTeamId = nextTeams[0]?.id ?? null;
    }

    setPhase(nextPhase);
    setTeams(nextTeams);
    setSelectedTeamId(nextSelectedTeamId);
    setHistory(readHistoryFromStorage());
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    const stateToSave = {
      configVersion: CONFIG_VERSION,
      phase,
      config,
      selectedTeamId,
      onCourtIds,
      stats,
      expiredPeriods,
      gameState,
      isGameComplete,
      aiAnalysis
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
  }, [phase, config, selectedTeamId, onCourtIds, stats, expiredPeriods, gameState, isHydrated, isGameComplete, aiAnalysis]);

  useEffect(() => {
    if (!isHydrated) return;
    writeTeamsToStorage(teams, selectedTeamId);
  }, [teams, selectedTeamId, isHydrated]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    if (!teams.length) return;
    if (!selectedTeamId || !teams.some(team => team.id === selectedTeamId)) {
      setSelectedTeamId(teams[0].id);
    }
  }, [teams, selectedTeamId]);

  useEffect(() => {
    if (!isHydrated || !selectedTeamId) return;
    if (previousTeamIdRef.current && previousTeamIdRef.current !== selectedTeamId) {
      setOnCourtIds([]);
      setStats([]);
      setGameState(prev => ({ ...prev, onCourtIds: [] }));
    }
    previousTeamIdRef.current = selectedTeamId;
  }, [selectedTeamId, isHydrated]);

  useEffect(() => {
    if (!supabaseEnabled) return;
    return subscribeToAuth((user) => {
      setAuthUser(user);
    });
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    if (authUser) {
      setShowLanding(false);
      if (!hasRoutedOnAuthRef.current) {
        setGameState(prev => (
          prev.isRunning ? { ...prev, isRunning: false, lastClockUpdate: null } : prev
        ));
        setHistoryView('LIST');
        setSelectedHistoryId(null);
        setIsRosterViewOpen(false);
        hasRoutedOnAuthRef.current = true;
      }
    } else {
      setGameState(prev => (
        prev.isRunning ? { ...prev, isRunning: false, lastClockUpdate: null } : prev
      ));
      setShowLanding(true);
      setHistoryView(null);
      setSelectedHistoryId(null);
      setIsRosterViewOpen(false);
      hasRoutedOnAuthRef.current = false;
    }
  }, [authUser, isHydrated]);

  useEffect(() => {
    if (hasResumeSession) {
      setIsResumeBannerClosed(false);
    }
  }, [hasResumeSession]);

  useEffect(() => {
    if (!supabaseEnabled) {
      setTeamSyncState('disabled');
      setTeamSyncError(null);
      setTeamSyncAt(null);
      return;
    }
    if (!authUser) {
      setTeamSyncState('signedOut');
      setTeamSyncError(null);
      setTeamSyncAt(null);
    }
  }, [authUser]);

  useEffect(() => {
    if (!supabaseEnabled) return;
    if (!authUser) {
      isTeamSyncReadyRef.current = false;
      return;
    }

    let isActive = true;

    const syncTeams = async () => {
      try {
        setTeamSyncState('loading');
        setTeamSyncError(null);
        const remotePayload = await fetchUserTeams(authUser.id);
        if (!isActive) return;

        if (remotePayload?.teams?.length) {
          const remoteTeams = remotePayload.teams.map(team => normalizeTeam(team));
          const remoteSelected = remotePayload.selectedTeamId;
          const nextSelected = remoteSelected && remoteTeams.some(team => team.id === remoteSelected)
            ? remoteSelected
            : remoteTeams[0]?.id ?? null;
          const updatedAt = remotePayload.updatedAt ?? new Date().toISOString();

          isApplyingRemoteTeamsRef.current = true;
          setTeams(remoteTeams);
          setSelectedTeamId(nextSelected);
          lastTeamsSyncRef.current = updatedAt;
          setTeamSyncState('saved');
          setTeamSyncAt(updatedAt);
        } else {
          const localPayload = readTeamsFromStorage();
          const localTeams = localPayload.teams.length
            ? localPayload.teams.map(team => normalizeTeam(team))
            : [createTeam(DEFAULT_TEAM_NAME, [])];
          const localSelected = localPayload.selectedTeamId;
          const nextSelected = localSelected && localTeams.some(team => team.id === localSelected)
            ? localSelected
            : localTeams[0]?.id ?? null;
          const updatedAt = new Date().toISOString();

          isApplyingRemoteTeamsRef.current = true;
          setTeams(localTeams);
          setSelectedTeamId(nextSelected);
          lastTeamsSyncRef.current = updatedAt;

          await saveUserTeams(authUser.id, {
            teams: localTeams,
            selectedTeamId: nextSelected,
            updatedAt
          });
          setTeamSyncState('saved');
          setTeamSyncAt(updatedAt);
        }

        isTeamSyncReadyRef.current = true;
      } catch (error) {
        console.error('Failed to sync teams', error);
        setTeamSyncState('error');
        setTeamSyncError(error instanceof Error ? error.message : 'Unable to sync teams.');
      }
    };

    syncTeams();

    return () => {
      isActive = false;
    };
  }, [authUser]);

  useEffect(() => {
    if (!authUser || !supabaseEnabled) return;
    return subscribeToUserTeams(authUser.id, (payload) => {
      if (!payload?.teams?.length) return;

      const remoteUpdatedAt = payload.updatedAt ?? null;
      const localUpdatedAt = lastTeamsSyncRef.current;

      if (remoteUpdatedAt && localUpdatedAt) {
        const remoteTime = new Date(remoteUpdatedAt).getTime();
        const localTime = new Date(localUpdatedAt).getTime();
        if (!Number.isNaN(remoteTime) && !Number.isNaN(localTime) && remoteTime <= localTime) {
          return;
        }
      } else if (!remoteUpdatedAt && localUpdatedAt) {
        return;
      }

      const remoteTeams = payload.teams.map(team => normalizeTeam(team));
      const remoteSelected = payload.selectedTeamId;
      const nextSelected = remoteSelected && remoteTeams.some(team => team.id === remoteSelected)
        ? remoteSelected
        : remoteTeams[0]?.id ?? null;

      isApplyingRemoteTeamsRef.current = true;
      setTeams(remoteTeams);
      setSelectedTeamId(nextSelected);
      const updatedAt = remoteUpdatedAt ?? new Date().toISOString();
      lastTeamsSyncRef.current = updatedAt;
      setTeamSyncState('saved');
      setTeamSyncAt(updatedAt);
      setTeamSyncError(null);
      isTeamSyncReadyRef.current = true;
    });
  }, [authUser]);

  useEffect(() => {
    if (!authUser || !supabaseEnabled) return;
    let isActive = true;

    const syncHistory = async () => {
      try {
        const remoteEntries = (await fetchUserHistory(authUser.id)).map(normalizeHistoryEntry);
        if (!isActive) return;

        const storedHistory = historyRef.current.length ? historyRef.current : readHistoryFromStorage();
        const localEntries = storedHistory.map(normalizeHistoryEntry);
        const mergedEntries = mergeHistoryEntries(remoteEntries, localEntries);

        setHistory(mergedEntries);
        writeHistoryToStorage(mergedEntries);

        const remoteIds = new Set(remoteEntries.map(entry => entry.id));
        const missingEntries = localEntries.filter(entry => !remoteIds.has(entry.id));

        await Promise.all(
          missingEntries.map(entry =>
            saveHistoryEntry(authUser.id, entry).catch(error => {
              console.error('Failed to sync history entry', error);
            })
          )
        );
      } catch (error) {
        console.error('Failed to sync history', error);
      }
    };

    syncHistory();

    return () => {
      isActive = false;
    };
  }, [authUser]);

  useEffect(() => {
    if (!authUser || !supabaseEnabled || !isHydrated) return;
    if (!isTeamSyncReadyRef.current) return;
    if (isApplyingRemoteTeamsRef.current) {
      isApplyingRemoteTeamsRef.current = false;
      return;
    }
    const updatedAt = new Date().toISOString();
    lastTeamsSyncRef.current = updatedAt;
    setTeamSyncState('saving');
    setTeamSyncError(null);

    saveUserTeams(authUser.id, {
      teams,
      selectedTeamId,
      updatedAt
    }).then(() => {
      setTeamSyncState('saved');
      setTeamSyncAt(updatedAt);
    }).catch(error => {
      console.error('Failed to persist teams', error);
      setTeamSyncState('error');
      setTeamSyncError(error instanceof Error ? error.message : 'Unable to save teams.');
    });
  }, [authUser, teams, selectedTeamId, isHydrated]);

  const archiveCurrentGame = useCallback((outcome: GameHistoryOutcome) => {
    if (hasArchivedCurrentGame.current) return;
    if (stats.length === 0) return;

    const statsSnapshot = stats.map(s => ({
      ...s,
      periodMinutes: { ...s.periodMinutes }
    }));

    const totalPlayerSeconds = statsSnapshot.reduce((sum, s) => sum + (s.totalMinutes || 0), 0);
    if (totalPlayerSeconds === 0) return;

    const rosterSnapshot = roster.map(player => ({ ...player }));
    const teamSnapshot: TeamSnapshot = selectedTeam
      ? { id: selectedTeam.id, name: selectedTeam.name?.trim() || 'Unnamed Team' }
      : { id: 'unknown', name: 'Unknown Team' };
    const entry: GameHistoryEntry = {
      id: generateHistoryId(),
      completedAt: new Date().toISOString(),
      outcome,
      configSnapshot: { ...config },
      teamSnapshot,
      rosterSnapshot,
      statsSnapshot,
      aiAnalysis,
      durationSeconds: Math.round(totalPlayerSeconds / 5)
    };
    const normalizedEntry = normalizeHistoryEntry(entry);

    hasArchivedCurrentGame.current = true;
    if (authUser && supabaseEnabled) {
      saveHistoryEntry(authUser.id, normalizedEntry).catch(error => {
        console.error('Failed to sync history entry', error);
      });
    }
    setHistory(prev => {
      const filtered = prev.filter(hist => hist.id !== normalizedEntry.id);
      const next = [normalizedEntry, ...filtered].slice(0, HISTORY_LIMIT);
      writeHistoryToStorage(next);
      return next;
    });
  }, [stats, roster, config, aiAnalysis, authUser, selectedTeam]);

  const confirmReset = () => {
    archiveCurrentGame(isGameComplete ? 'COMPLETE' : 'RESET');
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  };

  useEffect(() => {
    if (isGameComplete && !isAnalyzing) {
      archiveCurrentGame('COMPLETE');
    }
  }, [isGameComplete, isAnalyzing, archiveCurrentGame]);

  // --- GAME LOGIC ---

  const updatePlayerStats = useCallback((secondsToAdd: number, currentOnCourt: string[], period: number) => {
    if (secondsToAdd === 0 || currentOnCourt.length === 0) return;
    setStats(prevStats => prevStats.map(s => {
      if (!currentOnCourt.includes(s.playerId)) return s;
      const currentPeriodSeconds = s.periodMinutes[period] || 0;
      const nextPeriodSeconds = Math.max(0, currentPeriodSeconds + secondsToAdd);
      const actualDelta = nextPeriodSeconds - currentPeriodSeconds;
      const nextTotalSeconds = Math.max(0, s.totalMinutes + actualDelta);
      return {
        ...s,
        periodMinutes: {
          ...s.periodMinutes,
          [period]: nextPeriodSeconds
        },
        totalMinutes: nextTotalSeconds
      };
    }));
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    if (phase === 'CONFIG') {
      setGameState(prev => ({
        ...prev,
        remainingSeconds: (config.periodMinutes * 60) + config.periodSeconds
      }));
    }
  }, [config.periodMinutes, config.periodSeconds, phase, isHydrated]);

  const toggleClock = () => {
    setGameState(prev => {
      const isRunning = !prev.isRunning;
      return { ...prev, isRunning, lastClockUpdate: isRunning ? Date.now() : null };
    });
  };

  useEffect(() => {
    if (gameState.isRunning && phase === 'GAME' && !isGameComplete) {
      timerRef.current = window.setInterval(() => {
        setGameState(prev => {
          if (prev.remainingSeconds <= 0) {
            if (timerRef.current) window.clearInterval(timerRef.current);
            return { ...prev, isRunning: false, remainingSeconds: 0 };
          }

          const now = Date.now();
          const lastUpdate = prev.lastClockUpdate || now;
          const elapsedMs = now - lastUpdate;
          const elapsedSecs = Math.floor(elapsedMs / 1000);

          if (elapsedSecs >= 1) {
            const playableSeconds = Math.min(elapsedSecs, prev.remainingSeconds);
            const nextRemaining = Math.max(0, prev.remainingSeconds - playableSeconds);
            const reachedZero = nextRemaining === 0;

            return {
              ...prev,
              remainingSeconds: nextRemaining,
              isRunning: reachedZero ? false : prev.isRunning,
              lastClockUpdate: reachedZero ? null : now - (elapsedMs % 1000)
            };
          }
          return prev;
        });
      }, 200);
    } else {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
  }, [gameState.isRunning, phase, isGameComplete]);

  useEffect(() => {
    const prevRemaining = previousRemainingSecondsRef.current;
    previousRemainingSecondsRef.current = gameState.remainingSeconds;

    if (phase !== 'GAME' || isGameComplete || !gameState.isRunning) return;

    const delta = prevRemaining - gameState.remainingSeconds;
    if (delta > 0) {
      updatePlayerStats(delta, gameState.onCourtIds, gameState.currentPeriod);
    }
  }, [gameState.remainingSeconds, gameState.onCourtIds, gameState.currentPeriod, gameState.isRunning, phase, isGameComplete, updatePlayerStats]);

  useEffect(() => {
    if (phase !== 'GAME') return;
    if (gameState.remainingSeconds !== 0) return;
    setExpiredPeriods(prev => (
      prev.includes(gameState.currentPeriod) ? prev : [...prev, gameState.currentPeriod]
    ));
  }, [gameState.remainingSeconds, gameState.currentPeriod, phase]);

  useEffect(() => {
    if (phase !== 'GAME') return;
    if (!expiredPeriods.includes(gameState.currentPeriod)) return;
    if (gameState.remainingSeconds === 0 && !gameState.isRunning) return;
    setGameState(prev => ({ ...prev, remainingSeconds: 0, isRunning: false, lastClockUpdate: null }));
  }, [expiredPeriods, gameState.currentPeriod, gameState.isRunning, gameState.remainingSeconds, phase]);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    const result = await analyzeRotation(roster, stats);
    setAiAnalysis(result ?? null);
    setIsAnalyzing(false);
  };

  const handleEndGame = () => {
    const isFinalPeriodComplete = gameState.currentPeriod === config.periodCount
      && gameState.remainingSeconds === 0;
    if (isFinalPeriodComplete) {
      setGameState(prev => (
        prev.isRunning ? { ...prev, isRunning: false, lastClockUpdate: null } : prev
      ));
      setIsGameComplete(true);
      handleAnalyze();
      return;
    }
    const endGameMessage = gameState.remainingSeconds > 0
      ? `Time remains in this ${periodLabelLower}. Are you sure you want to end the game now?`
      : `You're not in the final ${periodLabelLower}. Are you sure you want to end the game now?`;
    setConfirmState({
      title: 'End Game Early?',
      message: endGameMessage,
      confirmLabel: 'End Game',
      tone: 'danger',
      action: { type: 'END_GAME' }
    });
  };

  useEffect(() => {
    if (phase !== 'GAME') return;
    if (typeof window === 'undefined') return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [phase]);

  const adjustClockSeconds = (delta: number) => {
    if (gameState.isRunning) return;
    if (expiredPeriods.includes(gameState.currentPeriod)) return;
    const maxSeconds = (config.periodMinutes * 60) + config.periodSeconds;
    const nextSeconds = Math.min(maxSeconds, Math.max(0, gameState.remainingSeconds + delta));
    const actualDelta = nextSeconds - gameState.remainingSeconds;
    if (actualDelta === 0) return;
    setGameState(prev => ({
      ...prev,
      remainingSeconds: nextSeconds,
      lastClockUpdate: null
    }));
    updatePlayerStats(-actualDelta, gameState.onCourtIds, gameState.currentPeriod);
  };

  const advanceToNextPeriod = () => {
    if (gameState.currentPeriod < config.periodCount) {
      const nextPeriodNumber = gameState.currentPeriod + 1;
      const nextRemainingSeconds = expiredPeriods.includes(nextPeriodNumber)
        ? 0
        : (config.periodMinutes * 60) + config.periodSeconds;
      setGameState(prev => ({
        ...prev,
        currentPeriod: nextPeriodNumber,
        remainingSeconds: nextRemainingSeconds,
        isRunning: false,
        lastClockUpdate: null
      }));
    } else {
      setIsGameComplete(true);
      handleAnalyze();
    }
  };

  const advanceToPrevPeriod = () => {
    if (gameState.currentPeriod <= 1) return;
    const prevPeriodNumber = gameState.currentPeriod - 1;
    const nextRemainingSeconds = expiredPeriods.includes(prevPeriodNumber)
      ? 0
      : (config.periodMinutes * 60) + config.periodSeconds;
    setGameState(prev => ({
      ...prev,
      currentPeriod: prevPeriodNumber,
      remainingSeconds: nextRemainingSeconds,
      isRunning: false,
      lastClockUpdate: null
    }));
  };

  const nextPeriod = () => {
    if (gameState.remainingSeconds !== 0) {
      setConfirmState({
        title: `Move to Next ${periodLabel}?`,
        message: `Time remains in this ${periodLabelLower}. Are you sure you want to move to the next ${periodLabelLower}?`,
        confirmLabel: `Next ${periodLabel}`,
        tone: 'warning',
        action: { type: 'NEXT_PERIOD' }
      });
      return;
    }
    advanceToNextPeriod();
  };

  const prevPeriod = () => {
    if (gameState.currentPeriod <= 1) return;
    if (gameState.remainingSeconds !== 0) {
      setConfirmState({
        title: `Move to Previous ${periodLabel}?`,
        message: `Time remains in this ${periodLabelLower}. Are you sure you want to move to the previous ${periodLabelLower}?`,
        confirmLabel: `Previous ${periodLabel}`,
        tone: 'warning',
        action: { type: 'PREV_PERIOD' }
      });
      return;
    }
    advanceToPrevPeriod();
  };

  const openHistoryList = () => {
    setGameState(prev => (
      prev.isRunning ? { ...prev, isRunning: false, lastClockUpdate: null } : prev
    ));
    setIsRosterViewOpen(false);
    setHistoryView('LIST');
    setSelectedHistoryId(null);
  };

  const openPeriodSettings = () => {
    setPeriodDraft({
      periodCount: config.periodCount,
      periodMinutes: config.periodMinutes,
      periodSeconds: config.periodSeconds,
      periodType: config.periodType
    });
    setIsPeriodSettingsOpen(true);
  };

  const handlePeriodSettingsSave = () => {
    setConfig(prev => ({
      ...prev,
      periodCount: periodDraft.periodCount,
      periodMinutes: periodDraft.periodMinutes,
      periodSeconds: periodDraft.periodSeconds,
      periodType: periodDraft.periodType
    }));
    setIsPeriodSettingsOpen(false);
  };

  const handleResumeSession = () => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const storedPhase = parsed?.phase;
          const storedConfig = parsed?.config ? normalizeConfig(parsed.config) : null;
          const storedOnCourtIds = Array.isArray(parsed?.onCourtIds) ? parsed.onCourtIds : null;
          const storedStats = Array.isArray(parsed?.stats) ? parsed.stats : null;
          const storedExpired = Array.isArray(parsed?.expiredPeriods)
            ? parsed.expiredPeriods.filter((value: unknown) => typeof value === 'number')
            : null;
          const storedGameState = parsed?.gameState;

          if (storedPhase === 'STARTERS' || storedPhase === 'GAME') {
            setPhase(storedPhase);
          }
          if (storedConfig) {
            setConfig(storedConfig);
          }
          if (storedOnCourtIds) {
            setOnCourtIds(storedOnCourtIds);
          }
          if (storedStats) {
            setStats(storedStats);
          }
          if (storedExpired) {
            setExpiredPeriods(storedExpired);
          }
          if (storedGameState && typeof storedGameState.remainingSeconds === 'number') {
            const storedGameOnCourt = Array.isArray(storedGameState.onCourtIds)
              ? storedGameState.onCourtIds
              : storedOnCourtIds ?? [];
            setGameState(prev => ({
              ...prev,
              ...storedGameState,
              onCourtIds: storedGameOnCourt,
              isRunning: false,
              lastClockUpdate: null
            }));
            previousRemainingSecondsRef.current = storedGameState.remainingSeconds;
          }
          if (typeof parsed?.isGameComplete === 'boolean') {
            setIsGameComplete(parsed.isGameComplete);
          }
          if ('aiAnalysis' in (parsed || {})) {
            setAiAnalysis(parsed?.aiAnalysis ?? null);
          }
        } catch (error) {
          console.error('Failed to resume session', error);
        }
      }
    }
    setHistoryView(null);
    setSelectedHistoryId(null);
    setIsRosterViewOpen(false);
    setShowLanding(false);
  };

  const handleDismissSession = () => {
    const nextRemainingSeconds = (config.periodMinutes * 60) + config.periodSeconds;
    setOnCourtIds([]);
    setStats([]);
    setPhase('CONFIG');
    setGameState({
      currentPeriod: 1,
      remainingSeconds: nextRemainingSeconds,
      isRunning: false,
      onCourtIds: [],
      lastClockUpdate: null
    });
    setIsGameComplete(false);
    setAiAnalysis(null);
    setIsAnalyzing(false);
    setIsSubModalOpen(false);
    setIsResumeBannerClosed(true);
    setExpiredPeriods([]);
    previousRemainingSecondsRef.current = nextRemainingSeconds;
    hasArchivedCurrentGame.current = false;
  };

  const openGameSetup = () => {
    setGameState(prev => (
      prev.isRunning ? { ...prev, isRunning: false, lastClockUpdate: null } : prev
    ));
    setHistoryView(null);
    setSelectedHistoryId(null);
    setIsRosterViewOpen(false);
    setPhase('CONFIG');
  };

  const openRosterView = () => {
    setHistoryView(null);
    setSelectedHistoryId(null);
    setIsRosterViewOpen(true);
  };

  const closeRosterView = () => {
    setIsRosterViewOpen(false);
  };

  const handleRosterContinue = () => {
    setIsRosterViewOpen(false);
    setPhase('STARTERS');
  };

  const handleSelectTeam = (teamId: string) => {
    if (!teamId) return;
    setSelectedTeamId(teamId);
  };

  const handleAddTeam = () => {
    const newTeam = createTeam(getNextTeamName(teams), []);
    setTeams(prev => [...prev, newTeam]);
    setSelectedTeamId(newTeam.id);
  };

  const handleDeleteTeam = (teamId: string) => {
    if (teams.length <= 1) return;
    const team = teams.find(item => item.id === teamId);
    const label = team?.name?.trim() || 'this team';
    setConfirmState({
      title: `Delete ${label}?`,
      message: 'This will remove all players from the roster.',
      confirmLabel: 'Delete Team',
      tone: 'danger',
      action: { type: 'DELETE_TEAM', teamId }
    });
  };

  const handleTeamNameChange = (teamId: string, name: string) => {
    setTeams(prev => prev.map(team => (
      team.id === teamId ? { ...team, name } : team
    )));
  };

  const handleAddPlayer = (teamId: string) => {
    setTeams(prev => prev.map(team => (
      team.id === teamId ? { ...team, players: [...team.players, createPlayer()] } : team
    )));
    if (teamId === selectedTeamId) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!rosterListRef.current) return;
          rosterListRef.current.scrollTo({
            top: rosterListRef.current.scrollHeight,
            behavior: 'smooth'
          });
        });
      });
    }
  };

  const handleUpdatePlayer = (teamId: string, playerId: string, updates: Partial<Player>) => {
    setTeams(prev => prev.map(team => (
      team.id === teamId
        ? {
          ...team,
          players: team.players.map(player => (
            player.id === playerId ? { ...player, ...updates } : player
          ))
        }
        : team
    )));
  };

  const handleRemovePlayer = (teamId: string, playerId: string) => {
    setTeams(prev => prev.map(team => (
      team.id === teamId
        ? { ...team, players: team.players.filter(player => player.id !== playerId) }
        : team
    )));

    if (teamId === selectedTeamId) {
      setOnCourtIds(prev => prev.filter(id => id !== playerId));
      setStats(prev => prev.filter(stat => stat.playerId !== playerId));
      setGameState(prev => ({ ...prev, onCourtIds: prev.onCourtIds.filter(id => id !== playerId) }));
    }
  };

  const handleSelectHistory = (entryId: string) => {
    setSelectedHistoryId(entryId);
    setHistoryView('DETAIL');
  };

  const handleDeleteHistory = (entryId: string) => {
    const entry = history.find(item => item.id === entryId);
    const opponentName = entry?.configSnapshot?.opponentName?.trim();
    const label = opponentName ? `vs ${opponentName}` : 'this session';
    setConfirmState({
      title: `Delete ${label}?`,
      message: 'This action cannot be undone.',
      confirmLabel: 'Delete Session',
      tone: 'danger',
      action: { type: 'DELETE_HISTORY', entryId }
    });
  };

  const handleGoogleSignIn = async () => {
    await signInWithGoogle();
  };

  const handleEmailSignIn = async (email: string, password: string) => {
    await signInWithEmail(email, password);
  };

  const handleEmailSignUp = async (email: string, password: string) => {
    await signUpWithEmail(email, password);
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
    } catch (error) {
      console.error('Failed to sign out', error);
    } finally {
      setAuthUser(null);
      setShowLanding(true);
      setHistoryView(null);
      setSelectedHistoryId(null);
      setIsRosterViewOpen(false);
      setIsAuthModalOpen(false);
      setGameState(prev => (
        prev.isRunning ? { ...prev, isRunning: false, lastClockUpdate: null } : prev
      ));
    }
  };

  // Open sub modal and pause the clock
  const handleOpenSubModal = () => {
    setGameState(prev => ({ ...prev, isRunning: false, lastClockUpdate: null }));
    setIsSubModalOpen(true);
  };

  const handleSubstitution = (outgoingIds: string[], incomingIds: string[]) => {
    setOnCourtIds(prev => {
      const outgoingSet = new Set(outgoingIds);
      const remaining = prev.filter(id => !outgoingSet.has(id));
      const additions = incomingIds.filter(id => !remaining.includes(id) && !outgoingSet.has(id));
      const newIds = [...remaining, ...additions];
      setGameState(gs => ({
        ...gs,
        onCourtIds: newIds,
        isRunning: false,
        lastClockUpdate: null
      }));
      return newIds;
    });
  };

  const handleExportPDF = () => {
    window.print();
  };

  const formatSyncTime = (iso: string | null) => {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  const handleConfirmAction = () => {
    if (!confirmState) return;
    const { action } = confirmState;
    setConfirmState(null);

    if (action.type === 'NEXT_PERIOD') {
      advanceToNextPeriod();
      return;
    }

    if (action.type === 'PREV_PERIOD') {
      advanceToPrevPeriod();
      return;
    }

    if (action.type === 'END_GAME') {
      setGameState(prev => (
        prev.isRunning ? { ...prev, isRunning: false, lastClockUpdate: null } : prev
      ));
      archiveCurrentGame('RESET');
      setIsGameComplete(true);
      return;
    }

    if (action.type === 'DELETE_TEAM') {
      const teamId = action.teamId;
      if (teams.length <= 1) return;
      if (!teams.some(item => item.id === teamId)) return;
      const nextTeams = teams.filter(item => item.id !== teamId);
      setTeams(nextTeams);
      if (teamId === selectedTeamId) {
        const nextTeamId = nextTeams[0]?.id ?? null;
        setSelectedTeamId(nextTeamId);
        setOnCourtIds([]);
        setStats([]);
        setGameState(prev => ({ ...prev, onCourtIds: [] }));
      }
      return;
    }

    if (action.type === 'DELETE_HISTORY') {
      const entryId = action.entryId;
      if (!history.some(item => item.id === entryId)) return;
      if (authUser && supabaseEnabled) {
        deleteHistoryEntry(authUser.id, entryId).catch(error => {
          console.error('Failed to delete history entry', error);
        });
      }

      setHistory(prev => {
        const next = prev.filter(item => item.id !== entryId);
        writeHistoryToStorage(next);
        return next;
      });

      if (selectedHistoryId === entryId) {
        setSelectedHistoryId(null);
        setHistoryView('LIST');
      }
    }
  };

  if (!isHydrated) return <div className="min-h-screen flex items-center justify-center text-slate-500 font-oswald text-2xl uppercase italic">Loading Session...</div>;

  // --- GLOBAL OVERLAYS ---
  const ResetOverlay = () => (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-6 animate-in fade-in duration-300" data-history-count={history.length}>
      <div className="bg-slate-900 border border-slate-700 max-w-md w-full rounded-3xl p-8 text-center shadow-2xl">
        <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-3xl font-oswald text-white mb-4 uppercase italic">End Game?</h2>
        <p className="text-slate-400 mb-8">All data will be permanently deleted for this session. Are you sure?</p>
        <div className="flex gap-4">
          <button onClick={() => setIsResetting(false)} className="flex-1 py-4 bg-slate-800 text-slate-300 font-bold rounded-xl hover:bg-slate-700 transition-colors">CANCEL</button>
          <button onClick={confirmReset} className="flex-1 py-4 bg-red-600 text-white font-bold rounded-xl hover:bg-red-500 transition-colors shadow-lg shadow-red-900/20">End Game</button>
        </div>
      </div>
    </div>
  );

  const ConfirmOverlay = () => {
    if (!confirmState) return null;
    const isDanger = confirmState.tone === 'danger';
    const iconTone = isDanger ? 'text-red-500' : 'text-orange-500';
    const iconBg = isDanger ? 'bg-red-500/10' : 'bg-orange-500/10';
    const confirmButtonStyle = isDanger
      ? 'bg-red-600 text-white hover:bg-red-500 shadow-lg shadow-red-900/20'
      : 'bg-orange-600 text-white hover:bg-orange-500 shadow-lg shadow-orange-900/20';

    return (
      <div className="fixed inset-0 z-[105] flex items-center justify-center bg-black/90 backdrop-blur-md p-6 animate-in fade-in duration-300">
        <div className="bg-slate-900 border border-slate-700 max-w-md w-full rounded-3xl p-8 text-center shadow-2xl">
          <div className={`w-20 h-20 ${iconBg} rounded-full flex items-center justify-center mx-auto mb-6`}>
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-10 w-10 ${iconTone}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-3xl font-oswald text-white mb-4 uppercase italic">{confirmState.title}</h2>
          <p className="text-slate-400 mb-8">{confirmState.message}</p>
          <div className="flex gap-4">
            <button
              onClick={() => setConfirmState(null)}
              className="flex-1 py-4 bg-slate-800 text-slate-300 font-bold rounded-xl hover:bg-slate-700 transition-colors"
            >
              CANCEL
            </button>
            <button
              onClick={handleConfirmAction}
              className={`flex-1 py-4 font-bold rounded-xl transition-colors ${confirmButtonStyle}`}
            >
              {confirmState.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const PeriodSettingsModal = () => {
    const draftLabels = getPeriodLabels(periodDraft.periodType);
    const draftLabelLower = draftLabels.singular.toLowerCase();
    const draftLabelPluralLower = draftLabels.plural.toLowerCase();

    return (
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 backdrop-blur-sm p-6 animate-in fade-in duration-200">
        <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-8 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-oswald text-white uppercase italic">{draftLabels.singular} Settings</h2>
              <p className="text-sm text-slate-400">Update game length defaults.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsPeriodSettingsOpen(false)}
              className="p-2 text-slate-500 hover:text-slate-200"
              aria-label={`Close ${draftLabelLower} settings`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Type</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPeriodDraft(prev => ({ ...prev, periodType: 'Halves', periodCount: 2 }))}
                  className={`py-3 rounded-xl border-2 font-bold transition-all ${
                    periodDraft.periodType === 'Halves'
                      ? 'border-orange-500 bg-orange-500/10 text-orange-500'
                      : 'border-slate-700 text-slate-500 hover:border-slate-600'
                  }`}
                >
                  2 Halves
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodDraft(prev => ({ ...prev, periodType: 'Quarters', periodCount: 4 }))}
                  className={`py-3 rounded-xl border-2 font-bold transition-all ${
                    periodDraft.periodType === 'Quarters'
                      ? 'border-orange-500 bg-orange-500/10 text-orange-500'
                      : 'border-slate-700 text-slate-500 hover:border-slate-600'
                  }`}
                >
                  4 Quarters
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Mins</label>
                <div className="relative">
                  <select
                    value={periodDraft.periodMinutes}
                    onChange={(event) => {
                      const value = parseInt(event.target.value, 10);
                      setPeriodDraft(prev => ({ ...prev, periodMinutes: value }));
                    }}
                    className="w-full appearance-none bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 pr-10 text-white font-bold text-lg outline-none focus:border-orange-500"
                  >
                    {Array.from({ length: 15 }, (_, i) => i + 1).map(value => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                  <svg
                    className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.7a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08z" />
                  </svg>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Secs</label>
                <div className="relative">
                  <select
                    value={periodDraft.periodSeconds}
                    onChange={(event) => {
                      const value = parseInt(event.target.value, 10);
                      setPeriodDraft(prev => ({ ...prev, periodSeconds: value }));
                    }}
                    className="w-full appearance-none bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 pr-10 text-white font-bold text-lg outline-none focus:border-orange-500"
                  >
                    {[0, 15, 30, 45].map(value => (
                      <option key={value} value={value}>
                        {value.toString().padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                  <svg
                    className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.7a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Changes apply to upcoming {draftLabelPluralLower}. Current time stays as-is.
          </p>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => setIsPeriodSettingsOpen(false)}
              className="flex-1 py-3 bg-slate-800 text-slate-300 font-bold rounded-xl hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePeriodSettingsSave}
              className="flex-1 py-3 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    );
  };

  const userLabel = authUser?.user_metadata?.full_name
    || authUser?.user_metadata?.name
    || authUser?.email
    || 'Account';
  const syncTimeLabel = formatSyncTime(teamSyncAt);
  const syncStatus = (() => {
    switch (teamSyncState) {
      case 'disabled':
        return { label: 'Sync: disabled', tone: 'neutral' as const };
      case 'signedOut':
        return { label: 'Sync: sign in', tone: 'neutral' as const };
      case 'loading':
        return { label: 'Sync: loading', tone: 'warning' as const };
      case 'saving':
        return { label: 'Sync: saving', tone: 'warning' as const };
      case 'saved':
        return { label: syncTimeLabel ? `Sync: saved ${syncTimeLabel}` : 'Sync: saved', tone: 'success' as const };
      case 'error':
        return { label: 'Sync: error', detail: teamSyncError ?? undefined, tone: 'error' as const };
      default:
        return { label: 'Sync: idle', tone: 'neutral' as const };
    }
  })();
  const navProps = {
    onGameSetup: openGameSetup,
    onManageRoster: openRosterView,
    onPastGames: openHistoryList,
    historyCount: history.length,
    isSignedIn: Boolean(authUser),
    userLabel,
    onSignIn: () => setIsAuthModalOpen(true),
    onSignOut: handleSignOut,
    syncStatus
  };

  const canStartGame = Boolean(authUser) || !supabaseEnabled;
  const shouldShowLanding = showLanding && !authUser;
  const landingPrimaryLabel = canStartGame
    ? 'Start New Game'
    : 'Login or signup to get started';
  const landingHelperText = !canStartGame
    ? 'Sign in to sync teams and game history across devices.'
    : null;
  const handleLandingPrimaryAction = () => {
    if (canStartGame) {
      setShowLanding(false);
      openGameSetup();
      return;
    }
    setIsAuthModalOpen(true);
  };

  const authModal = (
    <AuthModal
      isOpen={isAuthModalOpen}
      isEnabled={supabaseEnabled}
      onClose={() => setIsAuthModalOpen(false)}
      onGoogleSignIn={handleGoogleSignIn}
      onEmailSignIn={handleEmailSignIn}
      onEmailSignUp={handleEmailSignUp}
    />
  );
  const confirmOverlay = confirmState ? <ConfirmOverlay /> : null;

  const sortedHistory = sortHistoryEntries(history);
  const selectedHistoryEntry = selectedHistoryId
    ? history.find(entry => entry.id === selectedHistoryId)
    : null;
  const canAdvanceToStarters = roster.length >= 5;
  const isStartingFiveComplete = onCourtIds.length === 5;
  const shouldShowResumeBanner = Boolean(authUser) && hasResumeSession && !isResumeBannerClosed;

  const resumeBanner = shouldShowResumeBanner ? (
    <div className="rounded-2xl border border-orange-500/40 bg-orange-500/10 p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-orange-200">Session in progress</p>
          <p className="text-sm text-slate-200">You have an unfinished session saved on this device.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResumeSession}
            className="px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-bold uppercase tracking-wide text-xs"
          >
            Resume Session
          </button>
          <button
            type="button"
            onClick={handleDismissSession}
            className="p-2 text-orange-200/70 hover:text-orange-100 transition-colors"
            aria-label="Dismiss session"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const historyHeaderActions = (
    <AppNav {...navProps} active="history" />
  );
  const historyHeaderCta = (
    <button
      type="button"
      onClick={openGameSetup}
      className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-bold uppercase tracking-wide text-xs transition-colors"
    >
      Start New Game
    </button>
  );

  if (historyView === 'LIST') {
    return (
      <>
        {authModal}
        {confirmOverlay}
        <GameHistoryList
          entries={sortedHistory}
          onSelect={handleSelectHistory}
          onDelete={handleDeleteHistory}
          headerActions={historyHeaderActions}
          headerCta={historyHeaderCta}
          banner={resumeBanner}
        />
      </>
    );
  }

  if (historyView === 'DETAIL' && selectedHistoryEntry) {
    const entryDate = new Date(selectedHistoryEntry.completedAt);
    const periodSeconds = selectedHistoryEntry.configSnapshot.periodSeconds.toString().padStart(2, '0');
    const opponentName = selectedHistoryEntry.configSnapshot.opponentName?.trim();
    const opponentLabel = opponentName ? `vs ${opponentName}` : 'Opponent TBD';
    const teamLabel = selectedHistoryEntry.teamSnapshot?.name?.trim() || 'Unknown Team';
    const entryPeriodLabels = getPeriodLabels(selectedHistoryEntry.configSnapshot.periodType);
    const entryPeriodTypeLabel = selectedHistoryEntry.configSnapshot.periodCount === 1
      ? entryPeriodLabels.singular
      : entryPeriodLabels.plural;
    const entryPeriodLabel = `${selectedHistoryEntry.configSnapshot.periodCount} ${entryPeriodTypeLabel} x ${selectedHistoryEntry.configSnapshot.periodMinutes}:${periodSeconds}`;
    const entrySubtitle = `${entryDate.toLocaleDateString()} | ${entryDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} | ${opponentLabel}`;

    return (
      <>
        {authModal}
        {confirmOverlay}
        <PostGameReport
          title="Post-Game Report"
          subtitle={entrySubtitle}
          printDate={entryDate.toLocaleDateString()}
          config={selectedHistoryEntry.configSnapshot}
          roster={selectedHistoryEntry.rosterSnapshot}
          stats={selectedHistoryEntry.statsSnapshot}
          aiAnalysis={selectedHistoryEntry.aiAnalysis}
          nav={<AppNav {...navProps} active="history" />}
          actions={(
            <>
              <button onClick={handleExportPDF} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold uppercase tracking-wide flex items-center gap-2 transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                EXPORT PDF
              </button>
              <button onClick={() => setHistoryView('LIST')} className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold uppercase tracking-wide">
                DONE
              </button>
            </>
          )}
        />
      </>
    );
  }

  if (shouldShowLanding) {
    return (
      <>
        {authModal}
        {confirmOverlay}
        {isResetting && <ResetOverlay />}
        <LandingPage
          primaryLabel={landingPrimaryLabel}
          onPrimaryAction={handleLandingPrimaryAction}
          helperText={landingHelperText}
        />
      </>
    );
  }

  // --- RENDERING PHASE SCREENS ---
  if (phase === 'CONFIG' && !isRosterViewOpen) {
    return (
      <>
        {authModal}
        {confirmOverlay}
        <PageLayout contentClassName="flex flex-col justify-center relative">
          {isResetting && <ResetOverlay />}
          <div className="mb-8 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <Logo />
              <AppNav {...navProps} active="config" />
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-oswald text-white uppercase italic">Game Settings</h1>
              <p className="text-slate-400 text-lg">Define the structure of today's game.</p>
            </div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-3xl p-4 space-y-8">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Type</label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, periodType: 'Halves', periodCount: 2 })}
                  className={`py-4 rounded-xl border-2 font-bold transition-all ${
                    config.periodType === 'Halves'
                      ? 'border-orange-500 bg-orange-500/10 text-orange-500'
                      : 'border-slate-700 text-slate-500 hover:border-slate-600'
                  }`}
                >
                  2 Halves
                </button>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, periodType: 'Quarters', periodCount: 4 })}
                  className={`py-4 rounded-xl border-2 font-bold transition-all ${
                    config.periodType === 'Quarters'
                      ? 'border-orange-500 bg-orange-500/10 text-orange-500'
                      : 'border-slate-700 text-slate-500 hover:border-slate-600'
                  }`}
                >
                  4 Quarters
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Mins</label>
                <div className="relative">
                  <select
                    value={config.periodMinutes}
                    onChange={(e) => setConfig({ ...config, periodMinutes: parseInt(e.target.value, 10) })}
                    className="w-full appearance-none bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 pr-10 text-white font-bold text-xl outline-none focus:border-orange-500"
                  >
                    {Array.from({ length: 15 }, (_, i) => i + 1).map(value => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                  <svg
                    className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.7a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08z" />
                  </svg>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Secs</label>
                <div className="relative">
                  <select
                    value={config.periodSeconds}
                    onChange={(e) => setConfig({ ...config, periodSeconds: parseInt(e.target.value, 10) })}
                    className="w-full appearance-none bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 pr-10 text-white font-bold text-xl outline-none focus:border-orange-500"
                  >
                    {[0, 15, 30, 45].map(value => (
                      <option key={value} value={value}>
                        {value.toString().padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                  <svg
                    className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.7a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08z" />
                  </svg>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Opponent Team</label>
              <input
                type="text"
                value={config.opponentName}
                onChange={(e) => setConfig({ ...config, opponentName: e.target.value })}
                placeholder="Enter opponent name"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold text-lg outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Team</label>
              <div className="relative">
                <select
                  value={selectedTeamId ?? ''}
                  onChange={(e) => handleSelectTeam(e.target.value)}
                  className="w-full appearance-none bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 pr-12 text-white font-bold text-lg outline-none focus:border-orange-500"
                >
                  {teams.map(team => (
                    <option key={team.id} value={team.id}>
                      {team.name?.trim() ? team.name : 'Unnamed Team'}
                    </option>
                  ))}
                </select>
                <svg
                  className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.7a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08z" />
                </svg>
              </div>
            </div>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/50 border border-slate-700 rounded-2xl p-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Roster</p>
                <p className="text-lg font-bold text-white">{selectedTeamLabel}</p>
                <p className="text-sm text-slate-400">{roster.length} players ready</p>
                {roster.length < 5 && (
                  <p className="text-sm text-amber-400">Add at least 5 players before selecting starters.</p>
                )}
              </div>
              <button
                onClick={openRosterView}
                className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold uppercase tracking-wide text-sm"
              >
                Manage Roster
              </button>
            </div>
            <div className="flex flex-row gap-3">
              <button
                onClick={() => setIsResetting(true)}
                className="flex items-center justify-center px-4 py-5 rounded-2xl border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition-colors shrink-0"
                aria-label="Reset game"
                title="Reset game"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button
                onClick={() => setPhase('STARTERS')}
                disabled={!canAdvanceToStarters}
                className={`flex-1 py-5 rounded-2xl font-bold text-xl uppercase tracking-wide shadow-lg transition-all ${canAdvanceToStarters ? 'bg-orange-600 hover:bg-orange-500 text-white' : 'bg-slate-800 text-slate-600'
                  }`}
              >
                NEXT: STARTERS
              </button>
            </div>
          </div>
        </PageLayout>
      </>
    );
  }

  if (isRosterViewOpen) {
    return (
      <>
        {authModal}
        {confirmOverlay}
        <PageLayout contentClassName="flex flex-col justify-center">
          {isResetting && <ResetOverlay />}
          <div className="mb-8 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <Logo />
              <AppNav {...navProps} active="roster" />
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-oswald text-white uppercase italic">Manage Roster</h1>
              <p className="text-slate-400 text-lg">Update teams and players outside of game setup.</p>
            </div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-3xl p-4 space-y-6">
            {roster.length < 5 && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                Add at least 5 players to start a game.
              </div>
            )}
            <div className="grid gap-6 lg:grid-cols-[220px,1fr] min-w-0">
              <div className="space-y-4 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Teams</p>
                  <button
                    onClick={handleAddTeam}
                    className="text-xs font-bold uppercase tracking-wide text-slate-300 hover:text-white"
                  >
                    + Add
                  </button>
                </div>
                <div className="space-y-2">
                  {teams.map(team => (
                    <button
                      key={team.id}
                      onClick={() => handleSelectTeam(team.id)}
                      className={`w-full text-left rounded-xl border p-3 transition-all ${team.id === selectedTeamId
                        ? 'border-orange-500 bg-orange-500/10 text-orange-100'
                        : 'border-slate-700 bg-slate-900/40 text-slate-400 hover:border-slate-600'
                        }`}
                    >
                      <div className="text-sm font-bold truncate">
                        {team.name?.trim() ? team.name : 'Unnamed Team'}
                      </div>
                      <div className="text-xs text-slate-500">
                        {team.players.length} players
                      </div>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => selectedTeam && handleDeleteTeam(selectedTeam.id)}
                  disabled={teams.length <= 1}
                  className={`w-full px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide border ${teams.length <= 1
                    ? 'border-slate-700 text-slate-600'
                    : 'border-red-500/40 text-red-300 hover:bg-red-500/10'
                    }`}
                >
                  Delete Team
                </button>
              </div>
              <div className="space-y-6 min-w-0">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Team Name</label>
                  <input
                    type="text"
                    value={selectedTeam?.name ?? ''}
                    onChange={(e) => selectedTeam && handleTeamNameChange(selectedTeam.id, e.target.value)}
                    placeholder="Team name"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold text-lg outline-none focus:border-orange-500"
                  />
                </div>
                <div ref={rosterListRef} className="max-h-[360px] overflow-y-auto overflow-x-hidden space-y-3 pr-1 sm:pr-2 custom-scrollbar">
                  {roster.length === 0 && (
                    <div className="border border-dashed border-slate-700 rounded-2xl p-6 text-center text-slate-500">
                      No players yet. Add your roster to continue.
                    </div>
                  )}
                  {roster.map(p => (
                    <div key={p.id} className="flex gap-2 min-w-0">
                      <input
                        className="w-16 bg-slate-900 border border-slate-700 rounded-xl px-2 py-3 text-white text-center font-bold shrink-0"
                        value={p.number}
                        onChange={(e) => selectedTeam && handleUpdatePlayer(selectedTeam.id, p.id, { number: e.target.value })}
                        placeholder="#"
                      />
                      <input
                        className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold"
                        value={p.name}
                        onChange={(e) => selectedTeam && handleUpdatePlayer(selectedTeam.id, p.id, { name: e.target.value })}
                        placeholder="Player Name"
                      />
                      <button
                        onClick={() => selectedTeam && handleRemovePlayer(selectedTeam.id, p.id)}
                        className="p-3 text-red-400 hover:bg-red-400/10 rounded-xl shrink-0"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => selectedTeam && handleAddPlayer(selectedTeam.id)}
                  className="w-full py-3 border-2 border-dashed border-slate-700 text-slate-500 rounded-xl font-bold uppercase tracking-wide transition-all"
                >
                  + Add Player
                </button>
              </div>
            </div>
            <div className="flex gap-4 pt-4 border-t border-slate-700">
              <button onClick={closeRosterView} className="flex-1 py-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold uppercase tracking-wide">Back</button>
              {phase !== 'STARTERS' && (
                <button
                  onClick={handleRosterContinue}
                  disabled={!canAdvanceToStarters}
                  className={`flex-[2] py-4 rounded-xl font-bold uppercase tracking-wide ${canAdvanceToStarters ? 'bg-orange-600 hover:bg-orange-500 text-white' : 'bg-slate-900 text-slate-600'}`}
                >
                  Go to Starters
                </button>
              )}
            </div>
          </div>
        </PageLayout>
      </>
    );
  }

  if (phase === 'STARTERS') {
    return (
      <>
        {authModal}
        {confirmOverlay}
        <PageLayout contentClassName="flex flex-col justify-center">
          {isResetting && <ResetOverlay />}
          <div className="mb-8 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <Logo />
              <AppNav {...navProps} />
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-oswald text-white uppercase italic">Starting 5</h1>
              <p className="text-slate-400 text-lg">Pick the players starting on court.</p>
            </div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-3xl p-4 flex flex-col max-h-[80vh] max-h-[80dvh]">
            <div className="flex items-center justify-between gap-4 pb-3 text-xs font-bold uppercase tracking-widest">
              <span className="text-slate-400">Selected</span>
              <span className={isStartingFiveComplete ? 'text-emerald-300' : 'text-slate-400'}>
                {onCourtIds.length} / 5
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 flex-1 min-h-0 overflow-y-auto pr-1 sm:pr-2 custom-scrollbar">
              {roster.map(p => (
                <button key={p.id} onClick={() => { if (onCourtIds.includes(p.id)) setOnCourtIds(prev => prev.filter(id => id !== p.id)); else if (onCourtIds.length < 5) setOnCourtIds(prev => [...prev, p.id]); }} className={`flex items-center justify-between p-5 rounded-2xl border-2 transition-all ${onCourtIds.includes(p.id) ? 'border-orange-500 bg-orange-500/10 text-orange-500' : 'border-slate-700 bg-slate-900/50 text-slate-400'}`}>
                  <div className="flex items-center gap-4"><span className="w-10 h-10 flex items-center justify-center bg-slate-800 rounded-full font-oswald text-xl">{p.number}</span><span className="text-xl font-bold">{p.name || 'Unnamed Player'}</span></div>
                </button>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-700 flex gap-4 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
              <button onClick={() => setPhase('CONFIG')} className="flex-1 py-4 bg-slate-700 text-white rounded-2xl font-bold uppercase tracking-wide">Back</button>
              <button
                disabled={!isStartingFiveComplete}
                onClick={() => {
                  if (stats.length === 0) {
                    setStats(roster.map(p => ({ playerId: p.id, periodMinutes: {}, totalMinutes: 0 })));
                  }
                  setIsGameComplete(false);
                  setAiAnalysis(null);
                  setIsAnalyzing(false);
                  hasArchivedCurrentGame.current = false;
                  setExpiredPeriods([]);
                  const nextRemainingSeconds = (config.periodMinutes * 60) + config.periodSeconds;
                  previousRemainingSecondsRef.current = nextRemainingSeconds;
                  setPhase('GAME');
                  setGameState({
                    currentPeriod: 1,
                    remainingSeconds: nextRemainingSeconds,
                    isRunning: false,
                    onCourtIds,
                    lastClockUpdate: null
                  });
                }}
                className={`flex-[2] py-4 rounded-2xl font-bold text-xl uppercase tracking-wide transition-all ${isStartingFiveComplete ? 'bg-orange-600 hover:bg-orange-500 text-white' : 'bg-slate-700 text-slate-500'}`}
              >
                LET'S PLAY
              </button>
            </div>
          </div>
        </PageLayout>
      </>
    );
  }

  // --- GAME COMPLETE / REPORT VIEW ---
  if (isGameComplete) {
    const reportDate = new Date();
    const periodSeconds = config.periodSeconds.toString().padStart(2, '0');
    const opponentName = config.opponentName.trim();
    const opponentLabel = opponentName ? `vs ${opponentName}` : 'Opponent TBD';
    const reportPeriodTypeLabel = config.periodCount === 1 ? periodLabel : periodLabels.plural;
    const reportPeriodLabel = `${config.periodCount} ${reportPeriodTypeLabel} x ${config.periodMinutes}:${periodSeconds}`;
    const reportSubtitle = `${reportDate.toLocaleDateString()} | ${selectedTeamLabel} ${opponentLabel}`;

    return (
      <>
        {authModal}
        {confirmOverlay}
        {isResetting && <ResetOverlay />}
        <PostGameReport
          title="Post-Game Report"
          subtitle={reportSubtitle}
          printDate={reportDate.toLocaleDateString()}
          config={config}
          roster={roster}
          stats={stats}
          aiAnalysis={aiAnalysis}
          nav={<AppNav {...navProps} />}
          actions={(
            <>
              <button onClick={handleExportPDF} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold uppercase tracking-wide flex items-center gap-2 transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                EXPORT PDF
              </button>
              <button onClick={openHistoryList} className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold uppercase tracking-wide">
                Done
              </button>
            </>
          )}
        />
      </>
    );
  }

  // --- STANDARD GAME UI ---
  const nextPeriodLabel = gameState.currentPeriod === config.periodCount ? 'Finish Game' : `Next ${periodLabel}`;
  const onCourtPlayers = roster.filter(p => gameState.onCourtIds.includes(p.id));
  const onBenchPlayers = roster.filter(p => !gameState.onCourtIds.includes(p.id));

  return (
    <>
      {authModal}
      {confirmOverlay}
      <div className="min-h-screen pb-24 relative">
        {isResetting && <ResetOverlay />}
        {isPeriodSettingsOpen && <PeriodSettingsModal />}
        <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 py-4 shadow-lg">
          <div className={`max-w-4xl mx-auto ${PAGE_PADDING_X}`}>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <Logo />
                <AppNav {...navProps} />
              </div>
              <div className="flex flex-wrap justify-between items-end gap-3">
                <h1 className="text-xl font-oswald text-white uppercase italic tracking-tighter">{selectionSummary}</h1>
                <button
                  type="button"
                  onClick={openPeriodSettings}
                  className="px-3 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-slate-400 font-bold uppercase hover:border-slate-500 transition-colors inline-flex items-center gap-2"
                >
                  {config.periodCount} x {config.periodMinutes}:{config.periodSeconds}
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a1 1 0 001 1h11a2 2 0 002-2v-5m-7.586-3.414a2 2 0 112.828 2.828L9 16l-4 1 1-4 7.414-7.414z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className={`max-w-4xl mx-auto ${PAGE_PADDING_X} ${PAGE_PADDING_Y} space-y-10`}>
          <section className="flex flex-col lg:flex-row gap-8">
            <div className="w-full lg:w-1/3">
              <Clock
                seconds={gameState.remainingSeconds}
                isRunning={gameState.isRunning}
                onToggle={toggleClock}
                onPrevPeriod={prevPeriod}
                onNextPeriod={nextPeriod}
                onAdjustSeconds={adjustClockSeconds}
                onEndGame={handleEndGame}
                nextLabel={nextPeriodLabel}
                period={gameState.currentPeriod}
                periodCount={config.periodCount}
                periodType={config.periodType}
              />
              <button onClick={handleOpenSubModal} className="w-full mt-8 py-6 bg-orange-600 hover:bg-orange-500 text-white rounded-2xl font-bold text-2xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3"><svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>SUBSTITUTE</button>
            </div>
            <div className="w-full lg:w-2/3 space-y-6">
              <div className="bg-slate-800 rounded-2xl overflow-hidden border border-slate-700 shadow-xl">
                <div className="bg-slate-700/50 px-6 py-4 border-b border-slate-700"><h3 className="font-oswald text-xl text-white uppercase">Rotation Stats</h3></div>
                <div className="overflow-x-auto">
                  <table className="min-w-max w-full text-left">
                    <thead className="text-slate-500 text-xs uppercase bg-slate-900/30">
                      <tr>
                        <th className="sticky left-0 z-20 bg-slate-900 px-3 py-2 text-left whitespace-nowrap">Player</th>
                        {Array.from({ length: config.periodCount }).map((_, i) => (
                          <th key={i} className="px-2 py-2 text-center whitespace-nowrap">{periodLabelShort}{i + 1}</th>
                        ))}
                        <th className="px-3 py-2 text-right whitespace-nowrap">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {roster.map(p => {
                        const s = stats.find(st => st.playerId === p.id);
                        const isPlaying = gameState.onCourtIds.includes(p.id);
                        const stickyCellTone = isPlaying
                          ? 'bg-slate-800 border-l-4 border-orange-500'
                          : 'bg-slate-800 border-l-4 border-transparent';
                        return (
                          <tr key={p.id} className={`${isPlaying ? 'bg-orange-500/5' : ''}`}>
                            <td className={`sticky left-0 z-10 px-3 py-2 ${stickyCellTone}`}>
                              <div className="flex items-center gap-2 whitespace-nowrap">
                                <span className={`inline-flex w-8 h-8 shrink-0 items-center justify-center rounded-full aspect-square text-xs font-bold leading-none ${isPlaying ? 'bg-orange-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
                                  {p.number}
                                </span>
                                <span className={`font-bold ${isPlaying ? 'text-orange-500' : 'text-slate-200'}`}>
                                  {formatPlayerName(p.name)}
                                </span>
                              </div>
                            </td>
                            {Array.from({ length: config.periodCount }).map((_, i) => (
                              <td key={i} className="px-2 py-2 text-center text-slate-400 font-medium tabular-nums whitespace-nowrap">
                                {formatSeconds(s?.periodMinutes[i + 1] || 0)}
                              </td>
                            ))}
                            <td className="px-3 py-2 text-right font-bold text-slate-100 tabular-nums whitespace-nowrap">
                              {formatSeconds(s?.totalMinutes || 0)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        </main>

        <SubstitutionModal isOpen={isSubModalOpen} onClose={() => setIsSubModalOpen(false)} onCourt={onCourtPlayers} onBench={onBenchPlayers} onConfirm={handleSubstitution} />
      </div>
    </>
  );
};

export default App;
