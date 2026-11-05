import { createClient } from '@supabase/supabase-js';
import { MatchState } from './types';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  'https://vxgyudlhzgvwyovbdjhs.supabase.co';

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4Z3l1ZGxoemd2d3lvdmJkamhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4NjIyMTUsImV4cCI6MjEwMjQzODIxNX0.waLqGZ7ZZ9T9w0VRqBI1XP4lWfzMc5t0BwETDLfOuSw';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

// In-memory fallback / cache across serverless warm invocations
declare global {
  // eslint-disable-next-line no-var
  var __gridwars_matches: Map<string, MatchState> | undefined;
}

if (!globalThis.__gridwars_matches) {
  globalThis.__gridwars_matches = new Map<string, MatchState>();
}

const memoryStore = globalThis.__gridwars_matches;

export async function saveMatch(state: MatchState): Promise<void> {
  // 1. In-memory cache
  memoryStore.set(state.id, state);

  // 2. Persist to Supabase
  try {
    const { error } = await supabase.from('gridwars_matches').upsert(
      {
        id: state.id,
        data: state,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (error) {
      console.warn('[Storage] Supabase upsert error:', error.message);
    }
  } catch (err) {
    console.warn('[Storage] Failed to persist to Supabase:', err);
  }
}

export async function getMatch(id: string): Promise<MatchState | null> {
  // 1. Try Supabase first for real-time multiplayer consistency across clients
  try {
    const { data, error } = await supabase
      .from('gridwars_matches')
      .select('data')
      .eq('id', id)
      .maybeSingle();

    if (!error && data?.data) {
      const match = data.data as MatchState;
      memoryStore.set(id, match);
      return match;
    }
  } catch (err) {
    console.warn('[Storage] Supabase fetch failed, falling back to memory:', err);
  }

  // 2. Fallback to memory
  return memoryStore.get(id) || null;
}

export async function listRecentMatches(): Promise<MatchState[]> {
  try {
    const { data, error } = await supabase
      .from('gridwars_matches')
      .select('data')
      .order('updated_at', { ascending: false })
      .limit(10);

    if (!error && data) {
      return data.map((d) => d.data as MatchState);
    }
  } catch (err) {
    console.warn('[Storage] Failed to list matches from Supabase:', err);
  }

  return Array.from(memoryStore.values()).slice(-10);
}
