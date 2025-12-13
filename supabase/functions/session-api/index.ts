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
    // AI ENDPOINTS (Mocked for now - OpenRouter ready)
    // ============================================

    // POST /ai/scenario/analyze - Analyze scenario quality
    if (req.method === 'POST' && path === '/ai/scenario/analyze') {
      const { scenario_id } = await req.json();
      
      // Mock response - will be replaced with OpenRouter call
      const mockAnalysis = {
        scenario_id,
        quality_score: 0.85,
        estimated_success_rate: 0.78,
        risk_level: 'medium',
        risk_factors: [
          { factor: 'Dynamic content loading', severity: 'medium', step_indices: [0, 2] },
          { factor: 'Element visibility timing', severity: 'low', step_indices: [3] },
        ],
        duration_analysis: {
          estimated_seconds: 120,
          confidence: 0.82,
          breakdown: 'Navigation (10s) + Interaction (80s) + Verification (30s)',
        },
        suggestions: [
          { type: 'optimization', message: 'Consider adding explicit waits after navigation' },
          { type: 'reliability', message: 'Use more specific selectors for click actions' },
        ],
        ai_powered: false, // Will be true when OpenRouter is connected
      };

      return new Response(JSON.stringify(mockAnalysis), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /ai/scenario/suggest - Generate scenario improvements
    if (req.method === 'POST' && path === '/ai/scenario/suggest') {
      const { scenario_id, context } = await req.json();
      
      // Mock response - will be replaced with OpenRouter call
      const mockSuggestions = {
        scenario_id,
        suggestions: [
          {
            type: 'add_step',
            position: 1,
            step: { action: 'wait', duration: 2 },
            reason: 'Add buffer after page load for dynamic content',
          },
          {
            type: 'modify_step',
            position: 3,
            original: { action: 'click', selector: '.btn' },
            suggested: { action: 'click', selector: '[data-testid="primary-action"]' },
            reason: 'Use data-testid for more stable element targeting',
          },
          {
            type: 'add_step',
            position: 5,
            step: { action: 'scroll', randomized: true },
            reason: 'Add natural scroll behavior before interaction',
          },
        ],
        alternative_flows: [
          {
            name: 'Error Recovery Flow',
            description: 'Alternative path when primary action fails',
            steps: [
              { action: 'wait', duration: 3 },
              { action: 'scroll', randomized: true },
              { action: 'click', selector: '.retry-btn' },
            ],
          },
        ],
        ai_powered: false,
      };

      return new Response(JSON.stringify(mockSuggestions), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /ai/logs/explain - Explain session failure
    if (req.method === 'POST' && path === '/ai/logs/explain') {
      const { session_id } = await req.json();
      
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

      const errorLogs = logs?.filter(l => l.level === 'error') || [];
      
      // Mock response - will be replaced with OpenRouter call
      const mockExplanation = {
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
          'Possible A/B test variant with different DOM structure',
        ],
        recommendations: [
          {
            priority: 'high',
            action: 'Add explicit wait for element visibility before click',
            code_hint: '{ action: "wait", duration: 3 }',
          },
          {
            priority: 'medium',
            action: 'Use more resilient selector strategy',
            code_hint: 'Consider data-testid or aria-label selectors',
          },
        ],
        is_resumable: session?.is_resumable ?? false,
        resume_from_step: session?.last_successful_step ?? null,
        ai_powered: false,
      };

      return new Response(JSON.stringify(mockExplanation), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /ai/sessions/insights - Aggregated session insights
    if (req.method === 'POST' && path === '/ai/sessions/insights') {
      const { from_date, to_date, scenario_ids } = await req.json();
      
      // Fetch session data for analysis
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

      // Mock response - will be replaced with OpenRouter call
      const mockInsights = {
        period: { from: from_date, to: to_date },
        summary: {
          total_sessions: totalSessions,
          success_rate: totalSessions > 0 ? (successCount / totalSessions * 100).toFixed(1) : 0,
          avg_duration_seconds: 95,
          trend: 'improving',
        },
        patterns: [
          {
            type: 'failure_cluster',
            description: 'Higher failure rate during peak hours (14:00-18:00 UTC)',
            affected_sessions: Math.floor(failedCount * 0.6),
            severity: 'medium',
          },
          {
            type: 'step_bottleneck',
            description: 'Step 3 (click action) has 40% longer execution time than average',
            recommendation: 'Consider optimizing element selector or adding pre-wait',
            severity: 'low',
          },
          {
            type: 'success_pattern',
            description: 'Sessions with scroll actions before clicks have 25% higher success rate',
            recommendation: 'Add natural scroll behavior to scenarios',
            severity: 'info',
          },
        ],
        weak_steps: [
          { step_action: 'click', failure_rate: 0.15, common_error: 'Element not found' },
          { step_action: 'comment', failure_rate: 0.08, common_error: 'Timeout waiting for input' },
        ],
        optimization_tips: [
          'Increase wait times by 20% for scenarios targeting dynamic SPAs',
          'Consider implementing retry logic for network-dependent actions',
          'Profile-specific success rates suggest some profiles need cookie refresh',
        ],
        ai_powered: false,
      };

      return new Response(JSON.stringify(mockInsights), {
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
