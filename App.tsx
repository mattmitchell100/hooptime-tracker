
import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { User } from 'firebase/auth';
import { Player, PlayerStats, GameState, GameConfig, DEFAULT_CONFIG, GameHistoryEntry, GameHistoryOutcome, Team, TeamSnapshot } from './types';
import { AuthModal } from './components/AuthModal';
import { AppNav } from './components/AppNav';
import { Clock } from './components/Clock';
import { GameHistoryList } from './components/GameHistoryList';
import { PostGameReport } from './components/PostGameReport';
import { SubstitutionModal } from './components/SubstitutionModal';
import {
  deleteHistoryEntry,
  fetchUserHistory,
  fetchUserTeams,
  firebaseEnabled,
  saveHistoryEntry,
  saveUserTeams,
  signInWithEmail,
  signInWithGoogle,
  signOutUser,
  signUpWithEmail,
  subscribeToAuth
} from './services/firebase';
import { analyzeRotation } from './services/geminiService';

const STORAGE_KEY = 'hooptime_tracker_v1';
const HISTORY_STORAGE_KEY = 'hooptime_history_v1';
const TEAMS_STORAGE_KEY = 'hooptime_teams_v1';
const HISTORY_LIMIT = 20;
const DEFAULT_TEAM_NAME = 'Team 1';

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
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isGameComplete, setIsGameComplete] = useState(false);
  const [isResetting, setIsResetting] = useState(false); // Custom confirmation state
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

  const timerRef = useRef<number | null>(null);
  const hasArchivedCurrentGame = useRef(false);
  const previousRemainingSecondsRef = useRef(gameState.remainingSeconds);
  const historyRef = useRef<GameHistoryEntry[]>([]);
  const previousTeamIdRef = useRef<string | null>(null);
  const hasPromptedRosterRef = useRef(false);
  const isTeamSyncReadyRef = useRef(false);

  const selectedTeam = teams.find(team => team.id === selectedTeamId) || teams[0] || null;
  const roster = selectedTeam?.players ?? [];
  const selectedTeamLabel = selectedTeam?.name?.trim() || 'Unnamed Team';

  // --- PERSISTENCE ---
  useEffect(() => {
    const storedTeamsState = readTeamsFromStorage();
    let nextTeams = storedTeamsState.teams;
    let nextSelectedTeamId = storedTeamsState.selectedTeamId;

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const savedPhase = parsed.phase;
        if (savedPhase === 'ROSTER') {
          setPhase('CONFIG');
          setIsRosterViewOpen(true);
        } else if (savedPhase === 'CONFIG' || savedPhase === 'STARTERS' || savedPhase === 'GAME') {
          setPhase(savedPhase);
        } else {
          setPhase('CONFIG');
        }
        setConfig({ ...DEFAULT_CONFIG, ...parsed.config });
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

    setTeams(nextTeams);
    setSelectedTeamId(nextSelectedTeamId);
    setHistory(readHistoryFromStorage());
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    const stateToSave = {
      phase, config, selectedTeamId, onCourtIds, stats, gameState, isGameComplete, aiAnalysis
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
  }, [phase, config, selectedTeamId, onCourtIds, stats, gameState, isHydrated, isGameComplete, aiAnalysis]);

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
    if (!isHydrated || hasPromptedRosterRef.current) return;
    if (phase !== 'CONFIG') return;
    if (roster.length >= 5) return;
    setIsRosterViewOpen(true);
    hasPromptedRosterRef.current = true;
  }, [isHydrated, phase, roster.length]);

  useEffect(() => {
    if (!firebaseEnabled) return;
    return subscribeToAuth((user) => {
      setAuthUser(user);
    });
  }, []);

  useEffect(() => {
    if (!firebaseEnabled) return;
    if (!authUser) {
      isTeamSyncReadyRef.current = false;
      return;
    }

    let isActive = true;

    const syncTeams = async () => {
      try {
        const remotePayload = await fetchUserTeams(authUser.uid);
        if (!isActive) return;

        if (remotePayload?.teams?.length) {
          const remoteTeams = remotePayload.teams.map(team => normalizeTeam(team));
          const remoteSelected = remotePayload.selectedTeamId;
          const nextSelected = remoteSelected && remoteTeams.some(team => team.id === remoteSelected)
            ? remoteSelected
            : remoteTeams[0]?.id ?? null;

          setTeams(remoteTeams);
          setSelectedTeamId(nextSelected);
        } else {
          const localPayload = readTeamsFromStorage();
          const localTeams = localPayload.teams.length
            ? localPayload.teams.map(team => normalizeTeam(team))
            : [createTeam(DEFAULT_TEAM_NAME, [])];
          const localSelected = localPayload.selectedTeamId;
          const nextSelected = localSelected && localTeams.some(team => team.id === localSelected)
            ? localSelected
            : localTeams[0]?.id ?? null;

          setTeams(localTeams);
          setSelectedTeamId(nextSelected);

          await saveUserTeams(authUser.uid, {
            teams: localTeams,
            selectedTeamId: nextSelected,
            updatedAt: new Date().toISOString()
          });
        }

        isTeamSyncReadyRef.current = true;
      } catch (error) {
        console.error('Failed to sync teams', error);
      }
    };

    syncTeams();

    return () => {
      isActive = false;
    };
  }, [authUser]);

  useEffect(() => {
    if (!authUser || !firebaseEnabled) return;
    let isActive = true;

    const syncHistory = async () => {
      try {
        const remoteEntries = (await fetchUserHistory(authUser.uid)).map(normalizeHistoryEntry);
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
            saveHistoryEntry(authUser.uid, entry).catch(error => {
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
    if (!authUser || !firebaseEnabled || !isHydrated) return;
    if (!isTeamSyncReadyRef.current) return;

    saveUserTeams(authUser.uid, {
      teams,
      selectedTeamId,
      updatedAt: new Date().toISOString()
    }).catch(error => {
      console.error('Failed to persist teams', error);
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
    if (authUser && firebaseEnabled) {
      saveHistoryEntry(authUser.uid, normalizedEntry).catch(error => {
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
    setStats(prevStats => prevStats.map(s => {
      if (currentOnCourt.includes(s.playerId)) {
        return {
          ...s,
          periodMinutes: {
            ...s.periodMinutes,
            [period]: (s.periodMinutes[period] || 0) + secondsToAdd
          },
          totalMinutes: s.totalMinutes + secondsToAdd
        };
      }
      return s;
    }));
  }, []);

  useEffect(() => {
    if (phase === 'CONFIG') {
      setGameState(prev => ({
        ...prev,
        remainingSeconds: (config.periodMinutes * 60) + config.periodSeconds
      }));
    }
  }, [config.periodMinutes, config.periodSeconds, phase]);

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

    if (phase !== 'GAME' || isGameComplete) return;

    const delta = prevRemaining - gameState.remainingSeconds;
    if (delta > 0) {
      updatePlayerStats(delta, gameState.onCourtIds, gameState.currentPeriod);
    }
  }, [gameState.remainingSeconds, gameState.onCourtIds, gameState.currentPeriod, phase, isGameComplete, updatePlayerStats]);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    const result = await analyzeRotation(roster, stats);
    setAiAnalysis(result ?? null);
    setIsAnalyzing(false);
  };

  const nextPeriod = () => {
    if (gameState.currentPeriod < config.periodCount) {
      setGameState(prev => ({
        ...prev,
        currentPeriod: prev.currentPeriod + 1,
        remainingSeconds: (config.periodMinutes * 60) + config.periodSeconds,
        isRunning: false,
        lastClockUpdate: null
      }));
    } else {
      setIsGameComplete(true);
      handleAnalyze();
    }
  };

  const openHistoryList = () => {
    setGameState(prev => (
      prev.isRunning ? { ...prev, isRunning: false, lastClockUpdate: null } : prev
    ));
    setIsRosterViewOpen(false);
    setHistoryView('LIST');
    setSelectedHistoryId(null);
  };

  const closeHistoryView = () => {
    setHistoryView(null);
    setSelectedHistoryId(null);
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

    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(`Delete ${label}? This will remove all players.`);
      if (!confirmed) return;
    }

    setTeams(prev => prev.filter(item => item.id !== teamId));
    if (teamId === selectedTeamId) {
      const nextTeamId = teams.find(item => item.id !== teamId)?.id ?? null;
      setSelectedTeamId(nextTeamId);
      setOnCourtIds([]);
      setStats([]);
      setGameState(prev => ({ ...prev, onCourtIds: [] }));
    }
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

    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(`Delete ${label}? This cannot be undone.`);
      if (!confirmed) return;
    }

    if (authUser && firebaseEnabled) {
      deleteHistoryEntry(authUser.uid, entryId).catch(error => {
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
    await signOutUser();
  };

  // Open sub modal and pause the clock
  const handleOpenSubModal = () => {
    setGameState(prev => ({ ...prev, isRunning: false, lastClockUpdate: null }));
    setIsSubModalOpen(true);
  };

  const handleSubstitution = (outgoingId: string, incomingId: string) => {
    setOnCourtIds(prev => {
      const newIds = prev.filter(id => id !== outgoingId);
      newIds.push(incomingId);
      // Update game state with new players and RESUME the clock
      setGameState(gs => ({ 
        ...gs, 
        onCourtIds: newIds, 
        isRunning: true, 
        lastClockUpdate: Date.now() 
      }));
      return newIds;
    });
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleExportPDF = () => {
    window.print();
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
        <h2 className="text-3xl font-oswald text-white mb-4 uppercase italic">Reset Game?</h2>
        <p className="text-slate-400 mb-8">This will permanently delete all current stats and rotation data for this session.</p>
        <div className="flex gap-4">
          <button onClick={() => setIsResetting(false)} className="flex-1 py-4 bg-slate-800 text-slate-300 font-bold rounded-xl hover:bg-slate-700 transition-colors">CANCEL</button>
          <button onClick={confirmReset} className="flex-1 py-4 bg-red-600 text-white font-bold rounded-xl hover:bg-red-500 transition-colors shadow-lg shadow-red-900/20">RESET ALL</button>
        </div>
      </div>
    </div>
  );

  const userLabel = authUser?.displayName || authUser?.email || 'Account';
  const navProps = {
    onManageRoster: openRosterView,
    onPastGames: openHistoryList,
    historyCount: history.length,
    isSignedIn: Boolean(authUser),
    userLabel,
    onSignIn: () => setIsAuthModalOpen(true),
    onSignOut: handleSignOut
  };

  const authModal = (
    <AuthModal
      isOpen={isAuthModalOpen}
      isEnabled={firebaseEnabled}
      onClose={() => setIsAuthModalOpen(false)}
      onGoogleSignIn={handleGoogleSignIn}
      onEmailSignIn={handleEmailSignIn}
      onEmailSignUp={handleEmailSignUp}
    />
  );

  const sortedHistory = sortHistoryEntries(history);
  const selectedHistoryEntry = selectedHistoryId
    ? history.find(entry => entry.id === selectedHistoryId)
    : null;
  const canAdvanceToStarters = roster.length >= 5;

  if (historyView === 'LIST') {
    return (
      <>
        {authModal}
        <GameHistoryList
          entries={sortedHistory}
          onSelect={handleSelectHistory}
          onDelete={handleDeleteHistory}
          onClose={closeHistoryView}
          headerActions={<AppNav {...navProps} active="history" />}
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
    const entrySubtitle = `${entryDate.toLocaleDateString()} | ${entryDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} | ${teamLabel} | ${opponentLabel} | ${selectedHistoryEntry.configSnapshot.periodCount} x ${selectedHistoryEntry.configSnapshot.periodMinutes}:${periodSeconds} | ${selectedHistoryEntry.outcome === 'COMPLETE' ? 'Completed' : 'Reset Early'}`;

    return (
      <>
        {authModal}
        <PostGameReport
          title="Post-Game Report"
          subtitle={entrySubtitle}
          printDate={entryDate.toLocaleDateString()}
          config={selectedHistoryEntry.configSnapshot}
          roster={selectedHistoryEntry.rosterSnapshot}
          stats={selectedHistoryEntry.statsSnapshot}
          aiAnalysis={selectedHistoryEntry.aiAnalysis}
          actions={(
            <>
              <button onClick={handleExportPDF} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold uppercase tracking-wide flex items-center gap-2 transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                EXPORT PDF
              </button>
              <button onClick={() => setHistoryView('LIST')} className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold uppercase tracking-wide">
                BACK TO HISTORY
              </button>
              <AppNav {...navProps} active="history" />
            </>
          )}
        />
      </>
    );
  }

  if (historyView === 'DETAIL') {
    return (
      <>
        {authModal}
        <GameHistoryList
          entries={sortedHistory}
          onSelect={handleSelectHistory}
          onDelete={handleDeleteHistory}
          onClose={closeHistoryView}
          headerActions={<AppNav {...navProps} active="history" />}
        />
      </>
    );
  }

  // --- RENDERING PHASE SCREENS ---
  if (phase === 'CONFIG' && !isRosterViewOpen) {
    return (
      <>
        {authModal}
        <div className="min-h-screen p-8 max-w-2xl mx-auto flex flex-col justify-center relative">
          {isResetting && <ResetOverlay />}
          <div className="mb-8 space-y-4">
            <div className="w-full space-y-1">
              <h1 className="text-5xl font-oswald text-white uppercase italic">Game Settings</h1>
              <p className="text-slate-400 text-lg">Define the structure of today's game.</p>
            </div>
            <div className="w-full flex flex-wrap items-center gap-2">
              <button onClick={() => setIsResetting(true)} className="p-2 text-slate-600 hover:text-red-400 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
              <AppNav {...navProps} />
            </div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-3xl p-8 space-y-8">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Structure</label>
              <div className="grid grid-cols-2 gap-4">
                {(['Quarters', 'Halves'] as const).map((type) => (
                  <button key={type} onClick={() => setConfig({ ...config, periodType: type, periodCount: type === 'Quarters' ? 4 : 2 })} className={`py-4 rounded-xl border-2 font-bold transition-all ${config.periodType === type ? 'border-orange-500 bg-orange-500/10 text-orange-500' : 'border-slate-700 text-slate-500 hover:border-slate-600'}`}>{type}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-6">
              <div><label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Periods</label><input type="number" min="1" value={config.periodCount} onChange={(e) => setConfig({...config, periodCount: parseInt(e.target.value) || 1})} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold text-xl outline-none focus:border-orange-500" /></div>
              <div><label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Mins</label><input type="number" min="0" value={config.periodMinutes} onChange={(e) => setConfig({...config, periodMinutes: parseInt(e.target.value) || 0})} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold text-xl outline-none focus:border-orange-500" /></div>
              <div><label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Secs</label><input type="number" min="0" max="59" value={config.periodSeconds} onChange={(e) => setConfig({...config, periodSeconds: Math.min(59, parseInt(e.target.value) || 0)})} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold text-xl outline-none focus:border-orange-500" /></div>
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
              <select
                value={selectedTeamId ?? ''}
                onChange={(e) => handleSelectTeam(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold text-lg outline-none focus:border-orange-500"
              >
                {teams.map(team => (
                  <option key={team.id} value={team.id}>
                    {team.name?.trim() ? team.name : 'Unnamed Team'}
                  </option>
                ))}
              </select>
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
            <button
              onClick={() => setPhase('STARTERS')}
              disabled={!canAdvanceToStarters}
              className={`w-full py-5 rounded-2xl font-bold text-xl uppercase tracking-wide shadow-lg transition-all ${
                canAdvanceToStarters ? 'bg-orange-600 hover:bg-orange-500 text-white' : 'bg-slate-800 text-slate-600'
              }`}
            >
              NEXT: STARTERS
            </button>
          </div>
        </div>
      </>
    );
  }

  if (isRosterViewOpen) {
    return (
      <>
        {authModal}
        <div className="min-h-screen p-8 max-w-5xl mx-auto flex flex-col justify-center">
          {isResetting && <ResetOverlay />}
          <div className="mb-8 space-y-4">
            <div className="w-full space-y-1">
              <h1 className="text-5xl font-oswald text-white uppercase italic">Manage Roster</h1>
              <p className="text-slate-400 text-lg">Update teams and players outside of game setup.</p>
            </div>
            <div className="w-full flex flex-wrap items-center gap-2">
              <button
                onClick={closeRosterView}
                className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold uppercase tracking-wide text-sm"
              >
                Return
              </button>
              <AppNav {...navProps} active="roster" />
            </div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-3xl p-8 space-y-6">
            {roster.length < 5 && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                Add at least 5 players to start a game.
              </div>
            )}
            <div className="grid gap-8 lg:grid-cols-[220px,1fr]">
              <div className="space-y-4">
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
                      className={`w-full text-left rounded-xl border p-3 transition-all ${
                        team.id === selectedTeamId
                          ? 'border-orange-500 bg-orange-500/10 text-orange-100'
                          : 'border-slate-700 bg-slate-900/40 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      <div className="text-sm font-bold">
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
                  className={`w-full px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide border ${
                    teams.length <= 1
                      ? 'border-slate-700 text-slate-600'
                      : 'border-red-500/40 text-red-300 hover:bg-red-500/10'
                  }`}
                >
                  Delete Team
                </button>
              </div>
              <div className="space-y-6">
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
                <div className="max-h-[360px] overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                  {roster.length === 0 && (
                    <div className="border border-dashed border-slate-700 rounded-2xl p-6 text-center text-slate-500">
                      No players yet. Add your roster to continue.
                    </div>
                  )}
                  {roster.map(p => (
                    <div key={p.id} className="flex gap-2">
                      <input
                        className="w-16 bg-slate-900 border border-slate-700 rounded-xl px-2 py-3 text-white text-center font-bold"
                        value={p.number}
                        onChange={(e) => selectedTeam && handleUpdatePlayer(selectedTeam.id, p.id, { number: e.target.value })}
                        placeholder="#"
                      />
                      <input
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold"
                        value={p.name}
                        onChange={(e) => selectedTeam && handleUpdatePlayer(selectedTeam.id, p.id, { name: e.target.value })}
                        placeholder="Player Name"
                      />
                      <button
                        onClick={() => selectedTeam && handleRemovePlayer(selectedTeam.id, p.id)}
                        className="p-3 text-red-400 hover:bg-red-400/10 rounded-xl"
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
        </div>
      </>
    );
  }

  if (phase === 'STARTERS') {
    return (
      <>
        {authModal}
        <div className="min-h-screen p-8 max-w-2xl mx-auto flex flex-col justify-center">
          {isResetting && <ResetOverlay />}
          <div className="mb-8 space-y-4">
            <div className="w-full space-y-1">
              <h1 className="text-5xl font-oswald text-white uppercase italic">Starting 5</h1>
              <p className="text-slate-400 text-lg">Pick the players starting on court.</p>
            </div>
            <div className="w-full flex flex-wrap items-center gap-2">
              <AppNav {...navProps} />
            </div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-3xl p-8">
            <div className="grid grid-cols-1 gap-3 mb-8">
              {roster.map(p => (
                <button key={p.id} onClick={() => { if (onCourtIds.includes(p.id)) setOnCourtIds(prev => prev.filter(id => id !== p.id)); else if (onCourtIds.length < 5) setOnCourtIds(prev => [...prev, p.id]); }} className={`flex items-center justify-between p-5 rounded-2xl border-2 transition-all ${onCourtIds.includes(p.id) ? 'border-orange-500 bg-orange-500/10 text-orange-500' : 'border-slate-700 bg-slate-900/50 text-slate-400'}`}>
                  <div className="flex items-center gap-4"><span className="w-10 h-10 flex items-center justify-center bg-slate-800 rounded-full font-oswald text-xl">{p.number}</span><span className="text-xl font-bold">{p.name || 'Unnamed Player'}</span></div>
                </button>
              ))}
            </div>
            <div className="flex gap-4">
              <button onClick={() => setPhase('CONFIG')} className="flex-1 py-5 bg-slate-700 text-white rounded-2xl font-bold uppercase tracking-wide">Back</button>
              <button disabled={onCourtIds.length !== 5} onClick={() => { if (stats.length === 0) setStats(roster.map(p => ({ playerId: p.id, periodMinutes: {}, totalMinutes: 0 }))); setPhase('GAME'); setGameState(gs => ({ ...gs, onCourtIds })); }} className={`flex-[2] py-5 rounded-2xl font-bold text-xl uppercase tracking-wide transition-all ${onCourtIds.length === 5 ? 'bg-orange-600 hover:bg-orange-500 text-white' : 'bg-slate-700 text-slate-500'}`}>LET'S PLAY</button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // --- GAME COMPLETE / REPORT VIEW ---
  if (isGameComplete) {
    const reportDate = new Date();
    const periodSeconds = config.periodSeconds.toString().padStart(2, '0');
    const opponentName = config.opponentName.trim();
    const opponentLabel = opponentName ? `vs ${opponentName}` : 'Opponent TBD';
    const reportSubtitle = `${reportDate.toLocaleDateString()} | ${selectedTeamLabel} | ${opponentLabel} | ${config.periodCount} x ${config.periodMinutes}:${periodSeconds}`;

    return (
      <>
        {authModal}
        {isResetting && <ResetOverlay />}
        <PostGameReport
          title="Post-Game Report"
          subtitle={reportSubtitle}
          printDate={reportDate.toLocaleDateString()}
          config={config}
          roster={roster}
          stats={stats}
          aiAnalysis={aiAnalysis}
          isAnalyzing={isAnalyzing}
          onAnalyze={handleAnalyze}
          actions={(
            <>
              <button onClick={handleExportPDF} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold uppercase tracking-wide flex items-center gap-2 transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                EXPORT PDF
              </button>
              <button onClick={() => setIsResetting(true)} className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold uppercase tracking-wide">
                NEW GAME
              </button>
              <AppNav {...navProps} />
            </>
          )}
        />
      </>
    );
  }

  // --- STANDARD GAME UI ---
  const nextPeriodLabel = gameState.currentPeriod === config.periodCount ? 'Finish Game' : 'Next Period';
  const onCourtPlayers = roster.filter(p => gameState.onCourtIds.includes(p.id));
  const onBenchPlayers = roster.filter(p => !gameState.onCourtIds.includes(p.id));

  return (
    <>
      {authModal}
      <div className="min-h-screen pb-24 relative">
        {isResetting && <ResetOverlay />}
        <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-6 py-4 shadow-lg">
          <div className="space-y-3">
            <div className="w-full flex items-center gap-4">
              <h1 className="text-2xl font-oswald text-white uppercase italic tracking-tighter">HoopTime</h1>
              <span className="px-3 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-slate-400 font-bold uppercase">{config.periodCount} x {config.periodMinutes}:{config.periodSeconds}</span>
            </div>
            <div className="w-full flex flex-wrap items-center gap-2">
              <button onClick={() => setIsResetting(true)} className="p-2 text-slate-600 hover:text-red-400"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></button>
              <AppNav {...navProps} />
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto p-6 space-y-10">
          <section className="flex flex-col lg:flex-row gap-8">
            <div className="w-full lg:w-1/3">
              <Clock
                seconds={gameState.remainingSeconds}
                isRunning={gameState.isRunning}
                onToggle={toggleClock}
                onNextPeriod={nextPeriod}
                nextLabel={nextPeriodLabel}
                period={gameState.currentPeriod}
                periodType={config.periodType}
              />
              <button onClick={handleOpenSubModal} className="w-full mt-8 py-6 bg-orange-600 hover:bg-orange-500 text-white rounded-2xl font-bold text-2xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3"><svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>SUBSTITUTE</button>
            </div>
            <div className="w-full lg:w-2/3 space-y-6">
              <div className="bg-slate-800 rounded-2xl overflow-hidden border border-slate-700 shadow-xl">
                <div className="bg-slate-700/50 px-6 py-4 border-b border-slate-700"><h3 className="font-oswald text-xl text-white uppercase">Rotation Stats</h3></div>
                <table className="w-full text-left">
                  <thead className="text-slate-500 text-xs uppercase bg-slate-900/30">
                    <tr><th className="px-6 py-4">Player</th>{Array.from({length: config.periodCount}).map((_, i) => (<th key={i} className="px-4 py-4 text-center">P{i+1}</th>))}<th className="px-6 py-4 text-right">TOTAL</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {roster.map(p => {
                      const s = stats.find(st => st.playerId === p.id);
                      const isPlaying = gameState.onCourtIds.includes(p.id);
                      return (
                        <tr key={p.id} className={`${isPlaying ? 'bg-orange-500/5' : ''}`}>
                          <td className="px-6 py-4 flex items-center gap-3"><span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold ${isPlaying ? 'bg-orange-500 text-white' : 'bg-slate-700 text-slate-400'}`}>{p.number}</span><span className={`font-bold ${isPlaying ? 'text-orange-500' : 'text-slate-200'}`}>{p.name || '---'}</span></td>
                          {Array.from({length: config.periodCount}).map((_, i) => (<td key={i} className="px-4 py-4 text-center text-slate-400 font-medium">{formatSeconds(s?.periodMinutes[i+1] || 0)}</td>))}
                          <td className="px-6 py-4 text-right font-bold text-slate-100">{formatSeconds(s?.totalMinutes || 0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
