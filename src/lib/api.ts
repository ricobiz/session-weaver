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
  activeTasks: number;
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

export interface Task {
  id: string;
  name: string;
  description?: string;
  target_platform: string;
  entry_method: string;
  target_url?: string;
  search_query?: string;
  goal_type: string;
  behavior_config: unknown;
  profile_ids: string[];
  run_count: number;
  status: string;
  generated_scenario_id?: string;
  sessions_created: number;
  sessions_completed: number;
  sessions_failed: number;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
}

// Fetch dashboard stats
export async function fetchStats(): Promise<DashboardStats> {
  const today = new Date().toISOString().split('T')[0];

  const [activeRes, completedRes, failedRes, profilesRes, scenariosRes, avgRes, tasksRes] = await Promise.all([
    supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('status', 'running'),
    supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('status', 'success').gte('completed_at', today),
    supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('status', 'error').gte('completed_at', today),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('scenarios').select('*', { count: 'exact', head: true }),
    supabase.from('sessions').select('execution_time_ms').not('execution_time_ms', 'is', null).limit(100),
    supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'active')
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
    totalScenarios: scenariosRes.count || 0,
    activeTasks: tasksRes.count || 0
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

// Fetch all tasks
export async function fetchTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching tasks:', error);
    return [];
  }
  return data || [];
}

// Create a new task
export async function createTask(task: Omit<Task, 'id' | 'created_at' | 'updated_at' | 'sessions_created' | 'sessions_completed' | 'sessions_failed' | 'status'>): Promise<Task | null> {
  try {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify(task),
    });

    if (!response.ok) throw new Error('Failed to create task');
    return await response.json();
  } catch (error) {
    console.error('Error creating task:', error);
    return null;
  }
}

// Generate scenario from task
export async function generateScenarioFromTask(taskId: string): Promise<Scenario | null> {
  try {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/tasks/${taskId}/generate-scenario`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
    });

    if (!response.ok) throw new Error('Failed to generate scenario');
    return await response.json();
  } catch (error) {
    console.error('Error generating scenario:', error);
    return null;
  }
}

// Start task execution
export async function startTask(taskId: string): Promise<{ created: number; sessions: Session[] } | null> {
  try {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/tasks/${taskId}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
    });

    if (!response.ok) throw new Error('Failed to start task');
    return await response.json();
  } catch (error) {
    console.error('Error starting task:', error);
    return null;
  }
}

// Pause a running task
export async function pauseTask(taskId: string): Promise<boolean> {
  try {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/tasks/${taskId}/pause`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
    });
    return response.ok;
  } catch (error) {
    console.error('Error pausing task:', error);
    return false;
  }
}

// Resume a paused task
export async function resumeTask(taskId: string): Promise<boolean> {
  try {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/tasks/${taskId}/resume`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
    });
    return response.ok;
  } catch (error) {
    console.error('Error resuming task:', error);
    return false;
  }
}

// Stop a task completely
export async function stopTask(taskId: string): Promise<boolean> {
  try {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/tasks/${taskId}/stop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
    });
    return response.ok;
  } catch (error) {
    console.error('Error stopping task:', error);
    return false;
  }
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

// Delete a profile
export async function deleteProfile(profileId: string): Promise<boolean> {
  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', profileId);

  if (error) {
    console.error('Error deleting profile:', error);
    return false;
  }
  return true;
}

// Delete a task and its sessions
export async function deleteTask(taskId: string): Promise<boolean> {
  // First delete related sessions
  const { error: sessionsError } = await supabase
    .from('sessions')
    .delete()
    .eq('task_id', taskId);

  if (sessionsError) {
    console.error('Error deleting task sessions:', sessionsError);
    return false;
  }

  // Then delete the task
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId);

  if (error) {
    console.error('Error deleting task:', error);
    return false;
  }
  return true;
}

// Delete a session
export async function deleteSession(sessionId: string): Promise<boolean> {
  // First delete related logs
  const { error: logsError } = await supabase
    .from('session_logs')
    .delete()
    .eq('session_id', sessionId);

  if (logsError) {
    console.error('Error deleting session logs:', logsError);
  }

  // Then delete the session
  const { error } = await supabase
    .from('sessions')
    .delete()
    .eq('id', sessionId);

  if (error) {
    console.error('Error deleting session:', error);
    return false;
  }
  return true;
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
  try {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-api/scenarios/${scenarioId}/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
    });

    if (!response.ok) throw new Error('Failed to validate scenario');
    return await response.json();
  } catch (error) {
    console.error('Error validating scenario:', error);
    throw error;
  }
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

// Subscribe to task updates
export function subscribeToTasks(callback: (payload: any) => void) {
  return supabase
    .channel('tasks-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tasks' },
      callback
    )
    .subscribe();
}

// ============================================
// AI Model Optimizer API
// ============================================

export interface ModelConfig {
  id: string;
  task_type: string;
  primary_model: string;
  fallback_model: string | null;
  max_price_per_million_input: number | null;
  required_capabilities: string[];
  auto_update: boolean;
  last_checked_at: string | null;
  last_updated_at: string;
  notes: string | null;
}

export interface ModelCacheEntry {
  id: string;
  name: string;
  pricing_input: number;
  pricing_output: number;
  context_length: number;
  capabilities: string[];
  is_free: boolean;
}

export interface OptimizationResult {
  success: boolean;
  action: string;
  models_cached: number;
  recommendations: Array<{
    task_type: string;
    current_primary: string;
    recommended_primary: string | null;
    recommended_fallback: string | null;
    price_savings: string;
    updated: boolean;
  }>;
  top_vision_models: Array<{
    id: string;
    price_input: string;
    price_output: string;
  }>;
  message: string;
  error?: string;
}

// Check current model recommendations
export async function checkModelOptimization(): Promise<OptimizationResult | null> {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-model-optimizer?action=check`,
      {
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      }
    );

    if (!response.ok) throw new Error('Failed to check optimization');
    return await response.json();
  } catch (error) {
    console.error('Error checking model optimization:', error);
    return null;
  }
}

// Apply model optimizations
export async function applyModelOptimization(): Promise<OptimizationResult | null> {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-model-optimizer?action=optimize`,
      {
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      }
    );

    if (!response.ok) throw new Error('Failed to apply optimization');
    return await response.json();
  } catch (error) {
    console.error('Error applying model optimization:', error);
    return null;
  }
}

// Fetch model configurations
export async function fetchModelConfigs(): Promise<ModelConfig[]> {
  const { data, error } = await supabase
    .from('ai_model_config')
    .select('*')
    .order('task_type');

  if (error) {
    console.error('Error fetching model configs:', error);
    return [];
  }
  return data || [];
}

// Update model configuration
export async function updateModelConfig(
  taskType: string,
  updates: Partial<Pick<ModelConfig, 'primary_model' | 'fallback_model' | 'max_price_per_million_input' | 'auto_update'>>
): Promise<boolean> {
  const { error } = await supabase
    .from('ai_model_config')
    .update({ ...updates, last_updated_at: new Date().toISOString() })
    .eq('task_type', taskType);

  if (error) {
    console.error('Error updating model config:', error);
    return false;
  }
  return true;
}

// Fetch cached models
export async function fetchModelCache(capabilities?: string[]): Promise<ModelCacheEntry[]> {
  let query = supabase
    .from('ai_model_cache')
    .select('*')
    .order('pricing_input', { ascending: true });

  if (capabilities && capabilities.length > 0) {
    query = query.contains('capabilities', capabilities);
  }

  const { data, error } = await query.limit(100);

  if (error) {
    console.error('Error fetching model cache:', error);
    return [];
  }
  return data || [];
}
