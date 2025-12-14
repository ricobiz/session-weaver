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

    // POST /health - Runner health report
    if (req.method === 'POST' && path === '/health') {
      const body = await req.json();
      
      const { error } = await supabase
        .from('runner_health')
        .upsert({
          runner_id: body.runner_id,
          last_heartbeat: new Date().toISOString(),
          active_sessions: body.active_sessions,
          total_sessions_executed: body.total_sessions_executed,
          total_failures: body.total_failures,
          uptime_seconds: body.uptime_seconds,
        }, { onConflict: 'runner_id' });

      if (error) {
        console.error('[session-api] Health report error:', error);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /scenarios/:id/validate - Validate scenario (dry-run)
    if (req.method === 'POST' && path.match(/^\/scenarios\/[^/]+\/validate$/)) {
      const scenarioId = path.split('/')[2];
      
      const { data: scenario, error } = await supabase
        .from('scenarios')
        .select('steps')
        .eq('id', scenarioId)
        .single();

      if (error || !scenario) {
        return new Response(JSON.stringify({ error: 'Scenario not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const steps = scenario.steps as any[];
      const validActions = ['open', 'play', 'scroll', 'click', 'like', 'comment', 'wait'];
      const errors: string[] = [];
      const warnings: string[] = [];
      const stepBreakdown: any[] = [];
      let totalDuration = 0;

      steps.forEach((step, i) => {
        if (!step.action) errors.push(`Step ${i + 1}: action is required`);
        else if (!validActions.includes(step.action)) errors.push(`Step ${i + 1}: unknown action "${step.action}"`);
        
        if (step.action === 'open' && !step.target) errors.push(`Step ${i + 1}: target URL required for open`);
        if (step.action === 'comment' && !step.text) errors.push(`Step ${i + 1}: text required for comment`);
        
        const dur = step.duration || (step.action === 'play' ? 30 : step.action === 'comment' ? 10 : 5);
        totalDuration += dur;
        stepBreakdown.push({ index: i, action: step.action, estimated_seconds: dur });
      });

      // Update scenario validation status
      await supabase
        .from('scenarios')
        .update({ 
          is_valid: errors.length === 0,
          validation_errors: errors,
        })
        .eq('id', scenarioId);

      return new Response(JSON.stringify({
        valid: errors.length === 0,
        errors,
        warnings,
        estimated_duration_seconds: totalDuration,
        step_breakdown: stepBreakdown
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /export - Export data as JSON
    if (req.method === 'GET' && path === '/export') {
      const type = url.searchParams.get('type') || 'sessions';
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');

      let query = supabase.from(type).select('*');
      
      if (from) query = query.gte('created_at', from);
      if (to) query = query.lte('created_at', to);
      
      const { data, error } = await query.limit(1000);

      if (error) {
        return new Response(JSON.stringify({ error: 'Export failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ data, count: data?.length || 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /runners - Get runner health status
    if (req.method === 'GET' && path === '/runners') {
      const { data } = await supabase
        .from('runner_health')
        .select('*')
        .order('last_heartbeat', { ascending: false });

      return new Response(JSON.stringify(data || []), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============================================
    // TASK ENDPOINTS
    // ============================================

    // GET /tasks - Get all tasks
    if (req.method === 'GET' && path === '/tasks') {
      const { data } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });

      return new Response(JSON.stringify(data || []), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /tasks - Create a new task
    if (req.method === 'POST' && path === '/tasks') {
      const body = await req.json();
      
      const { data: task, error } = await supabase
        .from('tasks')
        .insert({
          name: body.name,
          description: body.description,
          target_platform: body.target_platform,
          entry_method: body.entry_method,
          target_url: body.target_url,
          search_query: body.search_query,
          goal_type: body.goal_type,
          behavior_config: body.behavior_config || {},
          profile_ids: body.profile_ids || [],
          run_count: body.run_count || 1,
          status: 'draft',
        })
        .select()
        .single();

      if (error) {
        console.error('[session-api] Error creating task:', error);
        return new Response(JSON.stringify({ error: 'Failed to create task' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify(task), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /tasks/:id/generate-scenario - Generate scenario from task
    if (req.method === 'POST' && path.match(/^\/tasks\/[^/]+\/generate-scenario$/)) {
      const taskId = path.split('/')[2];
      
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .single();

      if (taskError || !task) {
        return new Response(JSON.stringify({ error: 'Task not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Generate scenario steps based on task configuration
      // This is currently rule-based, will be AI-powered in next phase
      const steps: any[] = [];
      const behaviorConfig = task.behavior_config as any;
      
      // Entry step
      if (task.entry_method === 'url' && task.target_url) {
        steps.push({ action: 'open', target: task.target_url });
      } else if (task.entry_method === 'search' && task.search_query) {
        steps.push({ action: 'open', target: 'https://www.google.com' });
        steps.push({ action: 'wait', duration: 2 });
        steps.push({ action: 'click', selector: 'input[name="q"]' });
        steps.push({ action: 'comment', text: task.search_query, selector: 'input[name="q"]' });
        steps.push({ action: 'click', selector: 'input[type="submit"]' });
        steps.push({ action: 'wait', duration: 3 });
      }

      // Initial wait
      steps.push({ action: 'wait', duration: 3 });

      // Pre-action scroll if configured
      if (behaviorConfig?.scroll_before_action) {
        steps.push({ action: 'scroll', randomized: true });
        steps.push({ action: 'wait', duration: 2 });
      }

      // Goal-specific actions
      const minDuration = behaviorConfig?.min_duration || 30;
      const maxDuration = behaviorConfig?.max_duration || 120;
      const avgDuration = Math.floor((minDuration + maxDuration) / 2);

      switch (task.goal_type) {
        case 'play':
          steps.push({ action: 'play', duration: avgDuration, randomized: behaviorConfig?.randomize_timing });
          break;
        case 'like':
          steps.push({ action: 'scroll', randomized: true });
          steps.push({ action: 'wait', duration: 5 });
          steps.push({ action: 'like' });
          break;
        case 'comment':
          steps.push({ action: 'scroll', randomized: true });
          steps.push({ action: 'wait', duration: 5 });
          steps.push({ action: 'comment', text: 'Great content!' });
          break;
        case 'mix':
          steps.push({ action: 'play', duration: Math.floor(avgDuration * 0.7), randomized: true });
          steps.push({ action: 'scroll', randomized: true });
          steps.push({ action: 'like' });
          if (Math.random() > 0.5) {
            steps.push({ action: 'comment', text: 'Nice!' });
          }
          break;
      }

      // Final wait
      steps.push({ action: 'wait', duration: 2 });

      // Calculate estimated duration
      const estimatedDuration = steps.reduce((sum, step) => {
        return sum + (step.duration || (step.action === 'play' ? avgDuration : 5));
      }, 0);

      // Create scenario
      const { data: scenario, error: scenarioError } = await supabase
        .from('scenarios')
        .insert({
          name: `${task.name} - Auto Generated`,
          description: `Auto-generated scenario for task: ${task.description || task.name}`,
          steps,
          estimated_duration_seconds: estimatedDuration,
          is_valid: true,
          tags: ['auto-generated', task.goal_type],
        })
        .select()
        .single();

      if (scenarioError) {
        console.error('[session-api] Error creating scenario:', scenarioError);
        return new Response(JSON.stringify({ error: 'Failed to create scenario' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Update task with generated scenario
      await supabase
        .from('tasks')
        .update({ generated_scenario_id: scenario.id })
        .eq('id', taskId);

      return new Response(JSON.stringify(scenario), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /tasks/:id/start - Start task execution
    if (req.method === 'POST' && path.match(/^\/tasks\/[^/]+\/start$/)) {
      const taskId = path.split('/')[2];
      
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .single();

      if (taskError || !task) {
        return new Response(JSON.stringify({ error: 'Task not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!task.generated_scenario_id) {
        return new Response(JSON.stringify({ error: 'Task has no generated scenario' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const profileIds = task.profile_ids || [];
      if (profileIds.length === 0) {
        return new Response(JSON.stringify({ error: 'No profiles assigned to task' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Create sessions for each profile × run_count
      const sessions = [];
      for (const profileId of profileIds) {
        for (let i = 0; i < (task.run_count || 1); i++) {
          sessions.push({
            profile_id: profileId,
            scenario_id: task.generated_scenario_id,
            task_id: taskId,
            status: 'queued',
            profile_state: 'unknown',
          });
        }
      }

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
      const queueEntries = createdSessions!.map((s) => ({
        session_id: s.id,
        priority: 0,
      }));

      await supabase.from('execution_queue').insert(queueEntries);

      // Update task status
      await supabase
        .from('tasks')
        .update({
          status: 'active',
          started_at: new Date().toISOString(),
          sessions_created: createdSessions!.length,
        })
        .eq('id', taskId);

      return new Response(JSON.stringify({
        created: createdSessions!.length,
        sessions: createdSessions,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // PATCH /sessions/:id/captcha - Update captcha status
    if (req.method === 'PATCH' && path.match(/^\/sessions\/[^/]+\/captcha$/)) {
      const sessionId = path.split('/')[2];
      const body = await req.json();

      const updateData: Record<string, unknown> = {
        captcha_status: body.status,
      };

      if (body.status === 'detected') {
        updateData.captcha_detected_at = new Date().toISOString();
      } else if (body.status === 'solved' || body.status === 'failed') {
        updateData.captcha_resolved_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('sessions')
        .update(updateData)
        .eq('id', sessionId);

      if (error) {
        return new Response(JSON.stringify({ error: 'Failed to update captcha status' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // PATCH /sessions/:id/url - Update current URL
    if (req.method === 'PATCH' && path.match(/^\/sessions\/[^/]+\/url$/)) {
      const sessionId = path.split('/')[2];
      const { url } = await req.json();

      const { error } = await supabase
        .from('sessions')
        .update({ current_url: url })
        .eq('id', sessionId);

      if (error) {
        return new Response(JSON.stringify({ error: 'Failed to update URL' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // PATCH /sessions/:id/profile-state - Update profile auth state
    if (req.method === 'PATCH' && path.match(/^\/sessions\/[^/]+\/profile-state$/)) {
      const sessionId = path.split('/')[2];
      const { state } = await req.json();

      const { error } = await supabase
        .from('sessions')
        .update({ profile_state: state })
        .eq('id', sessionId);

      if (error) {
        return new Response(JSON.stringify({ error: 'Failed to update profile state' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============================================
    // SCREENSHOT ENDPOINTS - Visual Observability
    // ============================================

    // POST /sessions/:id/screenshot - Request screenshot capture
    // This sets a flag that the runner will pick up and respond to
    if (req.method === 'POST' && path.match(/^\/sessions\/[^/]+\/screenshot$/)) {
      const sessionId = path.split('/')[2];
      
      // Check if session exists and is active
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('id, status, runner_id, last_screenshot_url')
        .eq('id', sessionId)
        .single();

      if (sessionError || !session) {
        return new Response(JSON.stringify({ error: 'Session not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // If session is running, set a screenshot request flag in metadata
      if (session.status === 'running' && session.runner_id) {
        // Store screenshot request in session metadata
        await supabase
          .from('sessions')
          .update({ 
            metadata: {
              screenshot_requested: true,
              screenshot_requested_at: new Date().toISOString(),
            }
          })
          .eq('id', sessionId);

        console.log(`[session-api] Screenshot requested for session ${sessionId}`);

        // Return the last known screenshot while waiting for new one
        return new Response(JSON.stringify({ 
          status: 'requested',
          message: 'Screenshot capture requested from runner',
          screenshot_url: session.last_screenshot_url,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // If session is not running, return last known screenshot
      return new Response(JSON.stringify({ 
        status: 'cached',
        message: 'Session not running, showing last known screenshot',
        screenshot_url: session.last_screenshot_url,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // PUT /sessions/:id/screenshot - Upload screenshot from runner
    if (req.method === 'PUT' && path.match(/^\/sessions\/[^/]+\/screenshot$/)) {
      const sessionId = path.split('/')[2];
      const body = await req.json();
      
      // Body should contain base64 screenshot or URL
      const screenshotUrl = body.screenshot_url;
      const screenshotBase64 = body.screenshot_base64;
      
      let finalUrl = screenshotUrl;
      
      // If base64 is provided, we could store it or convert to URL
      // For now, we expect the runner to provide a URL (could be data: URL)
      if (screenshotBase64 && !screenshotUrl) {
        // Store as data URL for simplicity
        finalUrl = `data:image/png;base64,${screenshotBase64}`;
      }

      if (!finalUrl) {
        return new Response(JSON.stringify({ error: 'No screenshot provided' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Update session with screenshot URL and clear request flag
      const { error } = await supabase
        .from('sessions')
        .update({ 
          last_screenshot_url: finalUrl,
          metadata: {
            screenshot_requested: false,
            screenshot_captured_at: new Date().toISOString(),
            current_action: body.current_action,
          }
        })
        .eq('id', sessionId);

      if (error) {
        console.error('[session-api] Screenshot upload error:', error);
        return new Response(JSON.stringify({ error: 'Failed to save screenshot' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`[session-api] Screenshot uploaded for session ${sessionId}`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /sessions/:id/screenshot - Get current screenshot
    if (req.method === 'GET' && path.match(/^\/sessions\/[^/]+\/screenshot$/)) {
      const sessionId = path.split('/')[2];
      
      const { data: session, error } = await supabase
        .from('sessions')
        .select('last_screenshot_url, metadata, status')
        .eq('id', sessionId)
        .single();

      if (error || !session) {
        return new Response(JSON.stringify({ error: 'Session not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const metadata = session.metadata as any || {};

      return new Response(JSON.stringify({
        screenshot_url: session.last_screenshot_url,
        captured_at: metadata.screenshot_captured_at,
        current_action: metadata.current_action,
        status: session.status,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============================================
    // AI ENDPOINTS - OpenRouter Integration
    // ============================================

    const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
    const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-5';

    // Helper function for OpenRouter API calls
    async function callOpenRouter(model: string, messages: Array<{role: string, content: string}>) {
      if (!OPENROUTER_API_KEY) {
        throw new Error('OPENROUTER_API_KEY not configured');
      }

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://lovable.dev',
          'X-Title': 'Agent Control Plane',
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[OpenRouter] API error:', error);
        throw new Error(`OpenRouter API error: ${response.status}`);
      }

      return response.json();
    }

    // GET /ai/balance - Get OpenRouter account balance (using /credits endpoint)
    if (req.method === 'GET' && path === '/ai/balance') {
      try {
        if (!OPENROUTER_API_KEY) {
          return new Response(JSON.stringify({ 
            balance: 0, 
            credits_used: 0, 
            error: 'API key not configured' 
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Use /credits endpoint for actual balance (pay-as-you-go accounts)
        const creditsResponse = await fetch('https://openrouter.ai/api/v1/credits', {
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          },
        });

        if (!creditsResponse.ok) {
          console.error('[session-api] Credits API error:', creditsResponse.status);
          return new Response(JSON.stringify({ 
            balance: 0, 
            credits_used: 0, 
            error: 'Failed to fetch credits' 
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const creditsData = await creditsResponse.json();
        console.log('[session-api] OpenRouter credits data:', JSON.stringify(creditsData));
        
        // OpenRouter /credits returns:
        // - data.total_credits: total credits purchased
        // - data.total_usage: total credits used
        // For pay-as-you-go: balance = total_credits - total_usage
        const credits = creditsData.data || creditsData;
        const totalCredits = credits.total_credits ?? 0;
        const totalUsage = credits.total_usage ?? 0;
        const balance = totalCredits - totalUsage;
        
        return new Response(JSON.stringify({
          balance: balance,
          total_credits: totalCredits,
          credits_used: totalUsage,
          is_free_tier: credits.is_free_tier ?? false,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (error) {
        console.error('[session-api] Balance fetch error:', error);
        return new Response(JSON.stringify({ 
          balance: 0, 
          credits_used: 0, 
          error: 'Failed to fetch balance' 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // GET /ai/models - List available models from OpenRouter
    if (path === '/ai/models' && (req.method === 'GET' || req.method === 'POST')) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/models', {
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          },
        });

        if (!response.ok) {
          return new Response(JSON.stringify({ error: 'Failed to fetch models', status: response.status }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (error) {
        console.error('[session-api] Models fetch error:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch models' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // POST /ai/test - Test OpenRouter API key
    if (req.method === 'POST' && path === '/ai/test') {
      try {
        if (!OPENROUTER_API_KEY) {
          return new Response(JSON.stringify({ success: false, error: 'API key not configured' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const response = await fetch('https://openrouter.ai/api/v1/models', {
          headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}` },
        });

        if (response.ok) {
          return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          return new Response(JSON.stringify({ success: false, error: 'Invalid API key' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } catch (error) {
        return new Response(JSON.stringify({ success: false, error: 'Connection failed' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // POST /ai/scenario/analyze - REAL AI-POWERED: Analyze scenario quality
    if (req.method === 'POST' && path === '/ai/scenario/analyze') {
      const { scenario_id, model } = await req.json();
      const selectedModel = model || DEFAULT_MODEL;
      
      // Fetch scenario
      const { data: scenario } = await supabase
        .from('scenarios')
        .select('*')
        .eq('id', scenario_id)
        .single();

      if (!scenario) {
        return new Response(JSON.stringify({ error: 'Scenario not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Build prompt for analysis
      const steps = scenario.steps as any[];
      const stepsDescription = steps.map((s, i) => `Step ${i+1}: ${s.action}${s.target ? ` → ${s.target}` : ''}${s.duration ? ` (${s.duration}s)` : ''}`).join('\n');

      const systemPrompt = `You are an expert automation analyst. Analyze scenarios for browser automation and identify risks, quality issues, and optimization opportunities. Respond in valid JSON format only.`;
      
      const userPrompt = `Analyze this automation scenario for quality and risks:

Scenario: ${scenario.name}
Description: ${scenario.description || 'N/A'}
Steps:
${stepsDescription}

Provide analysis in this exact JSON format:
{
  "quality_score": <0.0-1.0>,
  "estimated_success_rate": <0.0-1.0>,
  "risk_level": "<low|medium|high>",
  "risk_factors": [{"factor": "<description>", "severity": "<low|medium|high>", "step_indices": [<indices>]}],
  "duration_analysis": {"estimated_seconds": <number>, "confidence": <0.0-1.0>, "breakdown": "<explanation>"},
  "suggestions": [{"type": "<optimization|reliability|performance>", "message": "<suggestion>"}]
}`;

      if (!OPENROUTER_API_KEY) {
        // Fallback mock if no API key
        return new Response(JSON.stringify({
          scenario_id,
          quality_score: 0.75,
          estimated_success_rate: 0.70,
          risk_level: 'medium',
          risk_factors: [{ factor: 'Analysis requires AI configuration', severity: 'medium', step_indices: [] }],
          duration_analysis: { estimated_seconds: scenario.estimated_duration_seconds || 60, confidence: 0.5, breakdown: 'Estimate based on step count' },
          suggestions: [{ type: 'optimization', message: 'Configure OpenRouter API key for AI-powered analysis' }],
          ai_powered: false,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      try {
        const aiResponse = await callOpenRouter(selectedModel, [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]);

        const content = aiResponse.choices?.[0]?.message?.content || '';
        let analysis;
        try {
          // Extract JSON from response
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
        } catch {
          analysis = {};
        }

        return new Response(JSON.stringify({
          scenario_id,
          ...analysis,
          ai_powered: true,
          model_used: selectedModel,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (error) {
        console.error('[AI] Scenario analyze error:', error);
        return new Response(JSON.stringify({
          scenario_id,
          quality_score: 0.75,
          risk_level: 'unknown',
          suggestions: [],
          ai_powered: false,
          error: 'AI analysis failed',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // POST /ai/scenario/suggest - Generate scenario improvements (Mocked - AI ready)
    if (req.method === 'POST' && path === '/ai/scenario/suggest') {
      const { scenario_id } = await req.json();
      
      const mockSuggestions = {
        scenario_id,
        suggestions: [
          { type: 'add_step', position: 1, step: { action: 'wait', duration: 2 }, reason: 'Add buffer after page load' },
          { type: 'modify_step', position: 3, suggested: { action: 'click', selector: '[data-testid="action"]' }, reason: 'Use stable selector' },
        ],
        ai_powered: false,
      };

      return new Response(JSON.stringify(mockSuggestions), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /ai/logs/explain - REAL AI-POWERED: Explain session failure
    if (req.method === 'POST' && path === '/ai/logs/explain') {
      const { session_id, model } = await req.json();
      const selectedModel = model || DEFAULT_MODEL;
      
      // Fetch actual logs for context
      const { data: logs } = await supabase
        .from('session_logs')
        .select('*')
        .eq('session_id', session_id)
        .order('timestamp', { ascending: true });

      const { data: session } = await supabase
        .from('sessions')
        .select('*, scenarios(*)')
        .eq('id', session_id)
        .single();

      // Check if we have OpenRouter configured
      if (!OPENROUTER_API_KEY) {
        // Return mock response if no API key
        const errorLogs = logs?.filter(l => l.level === 'error') || [];
        return new Response(JSON.stringify({
          session_id,
          summary: session?.error_message || 'Session failed during execution',
          root_cause: {
            type: 'element_not_found',
            description: 'The target element was not present in the DOM when the action was attempted',
            step_index: errorLogs[0]?.step_index ?? 0,
            confidence: 0.85,
          },
          contributing_factors: [
            'Page load timing exceeded expected threshold',
            'Dynamic content rendered after action attempt',
          ],
          recommendations: [
            { priority: 'high', action: 'Add explicit wait for element visibility', code_hint: '{ action: "wait", duration: 3 }' },
          ],
          is_resumable: session?.is_resumable ?? false,
          resume_from_step: session?.last_successful_step ?? null,
          ai_powered: false,
          note: 'OpenRouter API key not configured. Using fallback analysis.',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Build context for AI
      const logSummary = logs?.map(l => `[${l.level}] Step ${l.step_index ?? '-'}: ${l.message}`).join('\n') || 'No logs available';
      const scenarioSteps = JSON.stringify(session?.scenarios?.steps || [], null, 2);

      const systemPrompt = `You are an expert automation debugging assistant. Analyze the following session failure and provide actionable insights.

Your response MUST be valid JSON with this exact structure:
{
  "summary": "Brief one-line summary of the failure",
  "root_cause": {
    "type": "element_not_found|timeout|network_error|captcha_blocked|auth_required|unknown",
    "description": "Detailed explanation of what went wrong",
    "step_index": <number or null>,
    "confidence": <0.0 to 1.0>
  },
  "contributing_factors": ["factor1", "factor2"],
  "recommendations": [
    {
      "priority": "high|medium|low",
      "action": "What to do",
      "code_hint": "Optional code snippet or step suggestion"
    }
  ],
  "is_resumable": <boolean>,
  "resume_from_step": <number or null>
}`;

      const userPrompt = `Session ID: ${session_id}
Error Message: ${session?.error_message || 'Unknown error'}
Status: ${session?.status}
Last Successful Step: ${session?.last_successful_step ?? 'None'}
Total Steps: ${session?.total_steps}

Scenario Steps:
${scenarioSteps}

Execution Logs:
${logSummary}

Analyze this failure and provide debugging insights.`;

      try {
        const aiResponse = await callOpenRouter(selectedModel, [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ]);

        const content = aiResponse.choices?.[0]?.message?.content || '';
        
        // Parse AI response
        let parsedResponse;
        try {
          // Extract JSON from response (handle markdown code blocks)
          const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/\{[\s\S]*\}/);
          const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
          parsedResponse = JSON.parse(jsonStr);
        } catch (parseError) {
          console.error('[session-api] Failed to parse AI response:', parseError);
          parsedResponse = {
            summary: content.slice(0, 200),
            root_cause: { type: 'unknown', description: 'AI analysis completed but response parsing failed', confidence: 0.5 },
            contributing_factors: [],
            recommendations: [],
          };
        }

        return new Response(JSON.stringify({
          session_id,
          ...parsedResponse,
          is_resumable: session?.is_resumable ?? false,
          resume_from_step: session?.last_successful_step ?? null,
          ai_powered: true,
          model_used: selectedModel,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      } catch (error) {
        console.error('[session-api] OpenRouter call failed:', error);
        // Fallback to mock response
        return new Response(JSON.stringify({
          session_id,
          summary: session?.error_message || 'Session failed during execution',
          root_cause: { type: 'unknown', description: 'AI analysis failed - using fallback', confidence: 0.3 },
          contributing_factors: ['AI service temporarily unavailable'],
          recommendations: [{ priority: 'medium', action: 'Retry analysis later' }],
          is_resumable: session?.is_resumable ?? false,
          resume_from_step: session?.last_successful_step ?? null,
          ai_powered: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // POST /ai/sessions/insights - Aggregated session insights (Mocked - AI ready)
    if (req.method === 'POST' && path === '/ai/sessions/insights') {
      const { from_date, to_date, scenario_ids } = await req.json();
      
      let query = supabase
        .from('sessions')
        .select('*, scenarios(name)')
        .order('created_at', { ascending: false })
        .limit(100);

      if (from_date) query = query.gte('created_at', from_date);
      if (to_date) query = query.lte('created_at', to_date);
      if (scenario_ids?.length) query = query.in('scenario_id', scenario_ids);

      const { data: sessions } = await query;
      
      const totalSessions = sessions?.length || 0;
      const successCount = sessions?.filter(s => s.status === 'success').length || 0;
      const failedCount = sessions?.filter(s => s.status === 'error').length || 0;

      const mockInsights = {
        period: { from: from_date, to: to_date },
        summary: {
          total_sessions: totalSessions,
          success_rate: totalSessions > 0 ? (successCount / totalSessions * 100).toFixed(1) : 0,
          avg_duration_seconds: 95,
          trend: 'improving',
        },
        patterns: [
          { type: 'failure_cluster', description: 'Higher failure rate during peak hours', affected_sessions: Math.floor(failedCount * 0.6), severity: 'medium' },
          { type: 'success_pattern', description: 'Sessions with scroll actions before clicks have higher success rate', recommendation: 'Add natural scroll behavior', severity: 'info' },
        ],
        weak_steps: [
          { step_action: 'click', failure_rate: 0.15, common_error: 'Element not found' },
        ],
        optimization_tips: [
          'Increase wait times for dynamic SPAs',
          'Consider retry logic for network-dependent actions',
        ],
        ai_powered: false,
      };

      return new Response(JSON.stringify(mockInsights), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /tasks/:id/pause - Pause a running task
    if (req.method === 'POST' && path.match(/^\/tasks\/[^/]+\/pause$/)) {
      const taskId = path.split('/')[2];
      
      // Update task status
      await supabase
        .from('tasks')
        .update({ status: 'paused' })
        .eq('id', taskId);

      // Pause all queued/running sessions for this task
      await supabase
        .from('sessions')
        .update({ status: 'paused' })
        .eq('task_id', taskId)
        .in('status', ['queued', 'running']);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /tasks/:id/resume - Resume a paused task
    if (req.method === 'POST' && path.match(/^\/tasks\/[^/]+\/resume$/)) {
      const taskId = path.split('/')[2];
      
      // Update task status
      await supabase
        .from('tasks')
        .update({ status: 'active' })
        .eq('id', taskId);

      // Resume paused sessions - put them back in queue
      const { data: pausedSessions } = await supabase
        .from('sessions')
        .select('id')
        .eq('task_id', taskId)
        .eq('status', 'paused');

      if (pausedSessions?.length) {
        await supabase
          .from('sessions')
          .update({ status: 'queued' })
          .eq('task_id', taskId)
          .eq('status', 'paused');

        // Re-add to execution queue
        const queueEntries = pausedSessions.map((s) => ({
          session_id: s.id,
          priority: 0,
        }));
        await supabase.from('execution_queue').insert(queueEntries);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /sessions/:id/resume - Resume a failed/paused session from last checkpoint
    if (req.method === 'POST' && path.match(/^\/sessions\/[^/]+\/resume$/)) {
      const sessionId = path.split('/')[2];
      
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (sessionError || !session) {
        return new Response(JSON.stringify({ error: 'Session not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!session.is_resumable) {
        return new Response(JSON.stringify({ error: 'Session is not resumable' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Reset session for retry
      await supabase
        .from('sessions')
        .update({ 
          status: 'queued',
          error_message: null,
          retry_count: (session.retry_count || 0) + 1,
        })
        .eq('id', sessionId);

      // Add back to execution queue
      await supabase.from('execution_queue').insert({
        session_id: sessionId,
        priority: 1, // Higher priority for retries
      });

      return new Response(JSON.stringify({ success: true, resumed_from_step: session.last_successful_step }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /runners/check-disconnected - Check for disconnected runners and pause their sessions
    if (req.method === 'POST' && path === '/runners/check-disconnected') {
      const DISCONNECT_THRESHOLD_MS = 120000; // 2 minutes
      const now = new Date();
      const threshold = new Date(now.getTime() - DISCONNECT_THRESHOLD_MS).toISOString();

      // Find stale runners
      const { data: staleRunners } = await supabase
        .from('runner_health')
        .select('runner_id')
        .lt('last_heartbeat', threshold);

      if (staleRunners?.length) {
        const staleRunnerIds = staleRunners.map(r => r.runner_id);
        
        // Mark their running sessions as paused (recoverable)
        const { data: affectedSessions } = await supabase
          .from('sessions')
          .update({ 
            status: 'paused',
            error_message: 'Runner disconnected - session paused for recovery',
            is_resumable: true,
          })
          .in('runner_id', staleRunnerIds)
          .eq('status', 'running')
          .select('id');

        console.log(`[session-api] Paused ${affectedSessions?.length || 0} sessions from disconnected runners`);

        return new Response(JSON.stringify({ 
          stale_runners: staleRunnerIds,
          sessions_paused: affectedSessions?.length || 0,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ stale_runners: [], sessions_paused: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /sessions/auto-retry - Automatically retry failed resumable sessions
    if (req.method === 'POST' && path === '/sessions/auto-retry') {
      const { max_retries = 3 } = await req.json();

      // Find failed but resumable sessions that haven't exceeded retry limit
      const { data: retryableSessions } = await supabase
        .from('sessions')
        .select('id, retry_count, task_id')
        .eq('status', 'error')
        .eq('is_resumable', true)
        .lt('retry_count', max_retries);

      if (!retryableSessions?.length) {
        return new Response(JSON.stringify({ retried: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Queue them for retry
      for (const session of retryableSessions) {
        await supabase
          .from('sessions')
          .update({ 
            status: 'queued',
            error_message: null,
            retry_count: (session.retry_count || 0) + 1,
          })
          .eq('id', session.id);

        await supabase.from('execution_queue').insert({
          session_id: session.id,
          priority: 1,
        });
      }

      return new Response(JSON.stringify({ retried: retryableSessions.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /tasks/:id/stop - Stop a task completely
    if (req.method === 'POST' && path.match(/^\/tasks\/[^/]+\/stop$/)) {
      const taskId = path.split('/')[2];
      
      // Update task status
      await supabase
        .from('tasks')
        .update({ status: 'stopped', completed_at: new Date().toISOString() })
        .eq('id', taskId);

      // Cancel all non-completed sessions
      await supabase
        .from('sessions')
        .update({ status: 'cancelled' })
        .eq('task_id', taskId)
        .in('status', ['queued', 'running', 'paused']);

      // Remove from execution queue
      const { data: sessions } = await supabase
        .from('sessions')
        .select('id')
        .eq('task_id', taskId);

      if (sessions?.length) {
        await supabase
          .from('execution_queue')
          .delete()
          .in('session_id', sessions.map(s => s.id));
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /tasks/:id/stats - Get task execution stats
    if (req.method === 'GET' && path.match(/^\/tasks\/[^/]+\/stats$/)) {
      const taskId = path.split('/')[2];
      
      const { data: sessions } = await supabase
        .from('sessions')
        .select('id, status, error_message, last_successful_step, completed_at, profile_id, profiles(name)')
        .eq('task_id', taskId);

      const stats = {
        total: sessions?.length || 0,
        running: sessions?.filter(s => s.status === 'running').length || 0,
        queued: sessions?.filter(s => s.status === 'queued').length || 0,
        completed: sessions?.filter(s => s.status === 'success').length || 0,
        failed: sessions?.filter(s => s.status === 'error').length || 0,
        paused: sessions?.filter(s => s.status === 'paused').length || 0,
        cancelled: sessions?.filter(s => s.status === 'cancelled').length || 0,
        sessions: sessions || [],
      };

      return new Response(JSON.stringify(stats), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /vision/find-element - Find element coordinates using AI vision
    if (req.method === 'POST' && path === '/vision/find-element') {
      const body = await req.json();
      const { screenshot, description, multiple } = body;

      if (!screenshot || !description) {
        return new Response(JSON.stringify({ 
          error: 'screenshot (base64) and description are required' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      if (!LOVABLE_API_KEY) {
        return new Response(JSON.stringify({ error: 'AI not configured' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('[session-api] Vision find-element request:', description);

      const systemPrompt = `You are a visual element detector for browser automation.
Your task is to find clickable elements on a webpage screenshot based on a description.

IMPORTANT RULES:
1. Return ONLY valid JSON, no explanations
2. Coordinates must be PIXEL positions (x, y) relative to top-left corner
3. If element is not found, return {"found": false}
4. If element is found, return coordinates of the CENTER of the element
5. Consider buttons, links, icons, text labels, images as clickable elements
6. Look for visual cues: button styles, underlines, icons, hover states

Response format for single element:
{"found": true, "x": 123, "y": 456, "confidence": 0.95, "element_type": "button", "label": "Play"}

Response format for multiple elements:
{"found": true, "elements": [{"x": 123, "y": 456, "confidence": 0.9, "label": "First"}, ...]}`;

      const userPrompt = multiple 
        ? `Find ALL elements matching: "${description}". Return coordinates for each one.`
        : `Find the element: "${description}". Return its center coordinates.`;

      try {
        const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'system', content: systemPrompt },
              { 
                role: 'user', 
                content: [
                  { type: 'text', text: userPrompt },
                  { 
                    type: 'image_url', 
                    image_url: { 
                      url: screenshot.startsWith('data:') ? screenshot : `data:image/png;base64,${screenshot}`
                    } 
                  }
                ]
              }
            ],
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error('[session-api] Vision API error:', errText);
          return new Response(JSON.stringify({ error: 'Vision API failed', details: errText }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const aiResult = await response.json();
        const content = aiResult.choices?.[0]?.message?.content || '';
        
        // Parse JSON from response
        let parsed;
        try {
          // Extract JSON from markdown code blocks if present
          const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
          parsed = JSON.parse(jsonMatch[1].trim());
        } catch {
          console.error('[session-api] Failed to parse vision response:', content);
          return new Response(JSON.stringify({ 
            found: false, 
            error: 'Failed to parse AI response',
            raw: content 
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        console.log('[session-api] Vision result:', parsed);
        return new Response(JSON.stringify(parsed), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      } catch (error) {
        console.error('[session-api] Vision error:', error);
        return new Response(JSON.stringify({ 
          found: false, 
          error: error instanceof Error ? error.message : 'Vision failed' 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // POST /vision/analyze-page - Analyze page for automation opportunities
    if (req.method === 'POST' && path === '/vision/analyze-page') {
      const body = await req.json();
      const { screenshot, task } = body;

      if (!screenshot) {
        return new Response(JSON.stringify({ error: 'screenshot required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      if (!LOVABLE_API_KEY) {
        return new Response(JSON.stringify({ error: 'AI not configured' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const systemPrompt = `You are a browser automation analyst. Analyze screenshots to identify:
1. Current page state (what page is this, what's visible)
2. Clickable elements with their approximate coordinates
3. Recommended next action based on the task

Return JSON:
{
  "page_type": "search_results|player|login|error|other",
  "page_state": "description of current state",
  "elements": [
    {"type": "button|link|input|icon", "label": "text", "x": 123, "y": 456, "action": "click|type|scroll"}
  ],
  "recommended_action": {"action": "click|type|wait|scroll", "target": "element label or coordinates", "reason": "why"}
}`;

      try {
        const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'system', content: systemPrompt },
              { 
                role: 'user', 
                content: [
                  { type: 'text', text: task ? `Task: ${task}. Analyze this page and suggest next action.` : 'Analyze this page and identify all interactive elements.' },
                  { 
                    type: 'image_url', 
                    image_url: { 
                      url: screenshot.startsWith('data:') ? screenshot : `data:image/png;base64,${screenshot}`
                    } 
                  }
                ]
              }
            ],
          }),
        });

        if (!response.ok) {
          return new Response(JSON.stringify({ error: 'Vision API failed' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const aiResult = await response.json();
        const content = aiResult.choices?.[0]?.message?.content || '';
        
        let parsed;
        try {
          const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
          parsed = JSON.parse(jsonMatch[1].trim());
        } catch {
          return new Response(JSON.stringify({ 
            error: 'Failed to parse response',
            raw: content 
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify(parsed), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      } catch (error) {
        return new Response(JSON.stringify({ 
          error: error instanceof Error ? error.message : 'Analysis failed' 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
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
