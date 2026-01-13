import { createClient, type User } from '@supabase/supabase-js';
import type { GameHistoryEntry, Team } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

const supabase = hasSupabaseConfig ? createClient(supabaseUrl, supabaseAnonKey) : null;

export const supabaseEnabled = hasSupabaseConfig;

export const subscribeToAuth = (callback: (user: User | null) => void) => {
  if (!supabase) return () => {};

  supabase.auth.getSession().then(({ data, error }) => {
    if (error) return;
    callback(data.session?.user ?? null);
  });

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });

  return () => {
    data.subscription.unsubscribe();
  };
};

export const signInWithGoogle = async () => {
  if (!supabase) throw new Error('Supabase is not configured.');
  const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: redirectTo ? { redirectTo } : undefined
  });
  if (error) throw error;
};

export const signInWithEmail = async (email: string, password: string) => {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
};

export const signUpWithEmail = async (email: string, password: string) => {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
};

export const signOutUser = async () => {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const fetchUserHistory = async (uid: string): Promise<GameHistoryEntry[]> => {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('game_history')
    .select('id, completed_at, entry')
    .eq('user_id', uid)
    .order('completed_at', { ascending: false })
    .limit(20);

  if (error) throw error;

  return (data ?? [])
    .map((row) => {
      const entry = row.entry as GameHistoryEntry | null;
      if (!entry) return null;
      return {
        ...entry,
        id: entry.id || row.id,
        completedAt: entry.completedAt || row.completed_at || new Date().toISOString()
      };
    })
    .filter((entry): entry is GameHistoryEntry => Boolean(entry));
};

export const saveHistoryEntry = async (uid: string, entry: GameHistoryEntry) => {
  if (!supabase) return;
  const { error } = await supabase
    .from('game_history')
    .upsert(
      {
        user_id: uid,
        id: entry.id,
        completed_at: entry.completedAt,
        entry
      },
      { onConflict: 'user_id,id' }
    );
  if (error) throw error;
};

export const deleteHistoryEntry = async (uid: string, entryId: string) => {
  if (!supabase) return;
  const { error } = await supabase
    .from('game_history')
    .delete()
    .eq('user_id', uid)
    .eq('id', entryId);
  if (error) throw error;
};

export type TeamsPayload = {
  teams: Team[];
  selectedTeamId?: string | null;
  updatedAt?: string;
};

const normalizeTeamsPayload = (payload: TeamsPayload | null, updatedAt?: string | null) => {
  if (!payload) return null;
  const nextUpdatedAt = payload.updatedAt ?? updatedAt ?? undefined;
  return {
    ...payload,
    updatedAt: nextUpdatedAt
  };
};

export const fetchUserTeams = async (uid: string): Promise<TeamsPayload | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('user_teams')
    .select('payload, updated_at')
    .eq('user_id', uid)
    .maybeSingle();

  if (error) throw error;

  if (!data?.payload) return null;

  return normalizeTeamsPayload(data.payload as TeamsPayload, data.updated_at);
};

export const saveUserTeams = async (uid: string, payload: TeamsPayload) => {
  if (!supabase) return;
  const updatedAt = payload.updatedAt ?? new Date().toISOString();
  const payloadWithTimestamp: TeamsPayload = {
    ...payload,
    updatedAt
  };
  const { error } = await supabase
    .from('user_teams')
    .upsert(
      {
        user_id: uid,
        payload: payloadWithTimestamp,
        updated_at: updatedAt
      },
      { onConflict: 'user_id' }
    );

  if (error) throw error;
};

export const subscribeToUserTeams = (
  uid: string,
  callback: (payload: TeamsPayload | null) => void
) => {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`user_teams_${uid}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'user_teams', filter: `user_id=eq.${uid}` },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          callback(null);
          return;
        }
        const newRow = payload.new as { payload?: TeamsPayload; updated_at?: string | null } | null;
        if (!newRow?.payload) {
          callback(null);
          return;
        }
        callback(normalizeTeamsPayload(newRow.payload ?? null, newRow.updated_at));
      }
    );

  channel.subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};
