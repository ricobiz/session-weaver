import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-runner-id',
};

interface SessionRequest {
  scenario_id: string;
  profile_ids?: string[];
  priority?: number;
}

interface SessionUpdate {
  session_id: string;
  status?: string;
  progress?: number;
  current_step?: number;
  error_message?: string;
}

interface LogEntry {
  session_id: string;
  level: string;
  message: string;
  step_index?: number;
  action?: string;
  details?: Record<string, unknown>;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const url = new URL(req.url);
  const path = url.pathname.replace('/session-api', '');
  const runnerId = req.headers.get('x-runner-id') || 'unknown';

  console.log(`[session-api] ${req.method} ${path} from runner: ${runnerId}`);

  try {
    // GET /jobs - Claim next available job from queue
    if (req.method === 'GET' && path === '/jobs') {
      // Get scheduler config
      const { data: config } = await supabase
        .from('scheduler_config')
        .select('*')
        .single();

      // Count currently running sessions for this runner
      const { count: runningCount } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'running')
        .eq('runner_id', runnerId);

      const maxConcurrency = config?.max_concurrency || 5;
      if ((runningCount || 0) >= maxConcurrency) {
        return new Response(JSON.stringify({ 
          message: 'Max concurrency reached',
          running: runningCount,
          max: maxConcurrency 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Claim next job from queue
      const { data: job, error: claimError } = await supabase
        .from('execution_queue')
        .select(`
          id,
          session_id,
          priority,
          sessions (
            id,
            profile_id,
            scenario_id,
            profiles (id, name, email, storage_state, network_config, session_context),
            scenarios (id, name, steps)
          )
        `)
        .is('claimed_by', null)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (claimError || !job) {
        return new Response(JSON.stringify({ message: 'No jobs available' }), {
          status: 204,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Claim the job
      await supabase
        .from('execution_queue')
        .update({ claimed_by: runnerId, claimed_at: new Date().toISOString() })
        .eq('id', job.id);

      const sessionData = job.sessions as any;
      const steps = sessionData?.scenarios?.steps;
      
      // Update session status
      await supabase
        .from('sessions')
        .update({ 
          status: 'running', 
          runner_id: runnerId,
          started_at: new Date().toISOString(),
          total_steps: Array.isArray(steps) ? steps.length : 0
        })
        .eq('id', job.session_id);

      // Add delay based on config
      const minDelay = config?.min_delay_ms || 1000;
      const maxDelay = config?.max_delay_ms || 5000;
      const delay = config?.randomize_delays 
        ? Math.floor(Math.random() * (maxDelay - minDelay) + minDelay)
        : minDelay;

      return new Response(JSON.stringify({ 
        job_id: job.id,
        session: job.sessions,
        delay_before_start_ms: delay
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /sessions - Create new session(s) for execution
    if (req.method === 'POST' && path === '/sessions') {
      const body: SessionRequest = await req.json();
      
      // Validate scenario exists
      const { data: scenario, error: scenarioError } = await supabase
        .from('scenarios')
        .select('id, steps')
        .eq('id', body.scenario_id)
        .single();

      if (scenarioError || !scenario) {
        return new Response(JSON.stringify({ error: 'Scenario not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get profiles (all if not specified)
      let profileIds = body.profile_ids;
      if (!profileIds || profileIds.length === 0) {
        const { data: profiles } = await supabase.from('profiles').select('id');
        profileIds = profiles?.map(p => p.id) || [];
      }

      if (profileIds.length === 0) {
        return new Response(JSON.stringify({ error: 'No profiles available' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Create sessions for each profile
      const sessions = profileIds.map(profile_id => ({
        profile_id,
        scenario_id: body.scenario_id,
        status: 'queued',
        total_steps: (scenario.steps as unknown[])?.length || 0
      }));

      const { data: createdSessions, error: sessionError } = await supabase
        .from('sessions')
        .insert(sessions)
        .select();

      if (sessionError) {
        console.error('[session-api] Error creating sessions:', sessionError);
        return new Response(JSON.stringify({ error: 'Failed to create sessions' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Add to execution queue
      const queueEntries = createdSessions!.map(s => ({
        session_id: s.id,
        priority: body.priority || 0
      }));

      await supabase.from('execution_queue').insert(queueEntries);

      console.log(`[session-api] Created ${createdSessions!.length} sessions for scenario ${body.scenario_id}`);

      return new Response(JSON.stringify({ 
        created: createdSessions!.length,
        sessions: createdSessions 
      }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // PATCH /sessions/:id - Update session status/progress
    if (req.method === 'PATCH' && path.startsWith('/sessions/')) {
      const sessionId = path.split('/')[2];
      const body: SessionUpdate = await req.json();

      const updateData: Record<string, unknown> = {};
      if (body.status) updateData.status = body.status;
      if (body.progress !== undefined) updateData.progress = body.progress;
      if (body.current_step !== undefined) updateData.current_step = body.current_step;
      if (body.error_message) updateData.error_message = body.error_message;
      
      if (body.status === 'success' || body.status === 'error') {
        updateData.completed_at = new Date().toISOString();
        
        // Remove from queue
        await supabase.from('execution_queue').delete().eq('session_id', sessionId);
        
        // Update profile last_active and sessions_run
        const { data: session } = await supabase
          .from('sessions')
          .select('profile_id, started_at')
          .eq('id', sessionId)
          .single();
          
        if (session?.profile_id) {
          await supabase.rpc('increment_profile_sessions', { p_id: session.profile_id });
        }
        
        if (session?.started_at) {
          updateData.execution_time_ms = Date.now() - new Date(session.started_at).getTime();
        }
      }

      const { error: updateError } = await supabase
        .from('sessions')
        .update(updateData)
        .eq('id', sessionId);

      if (updateError) {
        console.error('[session-api] Error updating session:', updateError);
        return new Response(JSON.stringify({ error: 'Failed to update session' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /logs - Add log entries
    if (req.method === 'POST' && path === '/logs') {
      const body: LogEntry | LogEntry[] = await req.json();
      const logs = Array.isArray(body) ? body : [body];

      const { error: logError } = await supabase
        .from('session_logs')
        .insert(logs.map(log => ({
          session_id: log.session_id,
          level: log.level,
          message: log.message,
          step_index: log.step_index,
          action: log.action,
          details: log.details || {}
        })));

      if (logError) {
        console.error('[session-api] Error inserting logs:', logError);
        return new Response(JSON.stringify({ error: 'Failed to insert logs' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /profiles/:id/storage - Update profile storage state
    if (req.method === 'POST' && path.match(/^\/profiles\/[^/]+\/storage$/)) {
      const profileId = path.split('/')[2];
      const storageState = await req.json();

      const { error } = await supabase
        .from('profiles')
        .update({ 
          storage_state: storageState,
          last_active: new Date().toISOString()
        })
        .eq('id', profileId);

      if (error) {
        return new Response(JSON.stringify({ error: 'Failed to update storage' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /stats - Get dashboard stats
    if (req.method === 'GET' && path === '/stats') {
      const [
        { count: activeCount },
        { count: completedToday },
        { count: failedToday },
        { count: profileCount },
        { count: scenarioCount }
      ] = await Promise.all([
        supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('status', 'running'),
        supabase.from('sessions').select('*', { count: 'exact', head: true })
          .eq('status', 'success')
          .gte('completed_at', new Date().toISOString().split('T')[0]),
        supabase.from('sessions').select('*', { count: 'exact', head: true })
          .eq('status', 'error')
          .gte('completed_at', new Date().toISOString().split('T')[0]),
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('scenarios').select('*', { count: 'exact', head: true })
      ]);

      // Calculate average duration
      const { data: avgData } = await supabase
        .from('sessions')
        .select('execution_time_ms')
        .not('execution_time_ms', 'is', null)
        .limit(100);

      const avgMs = avgData?.length 
        ? avgData.reduce((sum, s) => sum + (s.execution_time_ms || 0), 0) / avgData.length
        : 0;

      const avgDuration = avgMs > 0 
        ? `${Math.floor(avgMs / 60000)}m ${Math.floor((avgMs % 60000) / 1000)}s`
        : '0m 0s';

      return new Response(JSON.stringify({
        activeSessions: activeCount || 0,
        completedToday: completedToday || 0,
        failedToday: failedToday || 0,
        avgDuration,
        totalProfiles: profileCount || 0,
        totalScenarios: scenarioCount || 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[session-api] Unhandled error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
