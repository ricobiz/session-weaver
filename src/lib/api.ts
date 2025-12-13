import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Scenario = Database['public']['Tables']['scenarios']['Row'];
type Session = Database['public']['Tables']['sessions']['Row'];
type SessionLog = Database['public']['Tables']['session_logs']['Row'];

export interface DashboardStats {
  activeSessions: number;
  completedToday: number;
  failedToday: number;
  avgDuration: string;
  totalProfiles: number;
  totalScenarios: number;
}

export interface SessionWithRelations extends Session {
  profiles?: { id: string; name: string; email: string } | null;
  scenarios?: { id: string; name: string; steps: unknown } | null;
}

export interface RunnerHealth {
  id: string;
  runner_id: string;
  last_heartbeat: string;
  active_sessions: number;
  total_sessions_executed: number;
  total_failures: number;
  uptime_seconds: number;
  started_at: string;
  metadata: unknown;
}

// Fetch dashboard stats
export async function fetchStats(): Promise<DashboardStats> {
  const today = new Date().toISOString().split('T')[0];

  const [activeRes, completedRes, failedRes, profilesRes, scenariosRes, avgRes] = await Promise.all([
    supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('status', 'running'),
    supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('status', 'success').gte('completed_at', today),
    supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('status', 'error').gte('completed_at', today),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('scenarios').select('*', { count: 'exact', head: true }),
    supabase.from('sessions').select('execution_time_ms').not('execution_time_ms', 'is', null).limit(100)
  ]);

  const avgMs = avgRes.data?.length 
    ? avgRes.data.reduce((sum, s) => sum + (s.execution_time_ms || 0), 0) / avgRes.data.length
    : 0;

  return {
    activeSessions: activeRes.count || 0,
    completedToday: completedRes.count || 0,
    failedToday: failedRes.count || 0,
    avgDuration: avgMs > 0 ? `${Math.floor(avgMs / 60000)}m ${Math.floor((avgMs % 60000) / 1000)}s` : '0m 0s',
    totalProfiles: profilesRes.count || 0,
    totalScenarios: scenariosRes.count || 0
  };
}

// Fetch all profiles
export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching profiles:', error);
    return [];
  }
  return data || [];
}

// Fetch all scenarios
export async function fetchScenarios(): Promise<Scenario[]> {
  const { data, error } = await supabase
    .from('scenarios')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching scenarios:', error);
    return [];
  }
  return data || [];
}

// Fetch recent sessions with relations
export async function fetchSessions(limit = 20): Promise<SessionWithRelations[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select(`
      *,
      profiles (id, name, email),
      scenarios (id, name, steps)
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching sessions:', error);
    return [];
  }
  return data || [];
}

// Fetch logs for a session
export async function fetchSessionLogs(sessionId: string): Promise<SessionLog[]> {
  const { data, error } = await supabase
    .from('session_logs')
    .select('*')
    .eq('session_id', sessionId)
    .order('timestamp', { ascending: true });

  if (error) {
    console.error('Error fetching logs:', error);
    return [];
  }
  return data || [];
}

// Fetch runner health data
export async function fetchRunnerHealth(): Promise<RunnerHealth[]> {
  const { data, error } = await supabase
    .from('runner_health')
    .select('*')
    .order('last_heartbeat', { ascending: false });

  if (error) {
    console.error('Error fetching runner health:', error);
    return [];
  }
  return data || [];
}

// Create a new profile
export async function createProfile(profile: Omit<Profile, 'id' | 'created_at' | 'updated_at'>): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .insert(profile)
    .select()
    .single();

  if (error) {
    console.error('Error creating profile:', error);
    return null;
  }
  return data;
}

// Create a new scenario
export async function createScenario(scenario: Omit<Scenario, 'id' | 'created_at' | 'updated_at'>): Promise<Scenario | null> {
  const { data, error } = await supabase
    .from('scenarios')
    .insert(scenario)
    .select()
    .single();

  if (error) {
    console.error('Error creating scenario:', error);
    return null;
  }
  return data;
}

// Validate a scenario (dry-run)
export async function validateScenario(scenarioId: string) {
  const { data, error } = await supabase.functions.invoke('session-api', {
    method: 'POST',
    body: {
      _path: `/scenarios/${scenarioId}/validate`,
      _method: 'POST',
    }
  });

  if (error) {
    console.error('Error validating scenario:', error);
    throw error;
  }
  return data;
}

// Start session execution
export async function startSessionExecution(scenarioId: string, profileIds?: string[], priority = 0) {
  const { data, error } = await supabase.functions.invoke('session-api', {
    method: 'POST',
    body: {
      scenario_id: scenarioId,
      profile_ids: profileIds,
      priority
    }
  });

  if (error) {
    console.error('Error starting sessions:', error);
    throw error;
  }
  return data;
}

// Subscribe to session updates
export function subscribeToSessions(callback: (payload: any) => void) {
  return supabase
    .channel('sessions-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'sessions' },
      callback
    )
    .subscribe();
}

// Subscribe to log updates for a session
export function subscribeToLogs(sessionId: string, callback: (payload: any) => void) {
  return supabase
    .channel(`logs-${sessionId}`)
    .on(
      'postgres_changes',
      { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'session_logs',
        filter: `session_id=eq.${sessionId}`
      },
      callback
    )
    .subscribe();
}

// Subscribe to runner health updates
export function subscribeToRunnerHealth(callback: (payload: any) => void) {
  return supabase
    .channel('runner-health-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'runner_health' },
      callback
    )
    .subscribe();
}
