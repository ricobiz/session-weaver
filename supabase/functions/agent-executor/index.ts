import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-runner-id',
};

// ============= Types =============

interface AgentState {
  session_id: string;
  task_id: string;
  goal: string;
  current_url?: string;
  screenshot_base64?: string;
  page_html?: string;
  previous_actions?: AgentAction[];
  error?: string;
  attempt?: number;
  verification_results?: VerificationResult[];
}

interface AgentAction {
  type: 'navigate' | 'click' | 'type' | 'scroll' | 'wait' | 'screenshot' | 'complete' | 'fail' | 'create_bot';
  selector?: string;
  text?: string;
  url?: string;
  direction?: 'up' | 'down';
  amount?: number;
  reason?: string;
  coordinates?: { x: number; y: number };
  // For verification
  expected_changes?: ExpectedChange[];
  // For bot creation
  bot_config?: BotConfig;
}

interface ExpectedChange {
  type: 'url_contains' | 'element_visible' | 'element_hidden' | 'text_appears' | 'network_request' | 'dom_change';
  value: string;
  timeout_ms?: number;
}

interface VerificationResult {
  action_index: number;
  action_type: string;
  verified: boolean;
  confidence: number;
  evidence: {
    type: string;
    before?: any;
    after?: any;
    match?: boolean;
    details?: string;
  };
}

interface BotConfig {
  name: string;
  description: string;
  steps: BotStep[];
  target_platform: string;
}

interface BotStep {
  action: string;
  selector?: string;
  text?: string;
  url?: string;
  wait_ms?: number;
  expected_result?: ExpectedChange;
}

interface AgentResponse {
  action: AgentAction;
  reasoning: string;
  confidence: number;
  goal_progress: number;
  goal_achieved: boolean;
  requires_verification: boolean;
  verification_criteria?: ExpectedChange[];
}

// ============= Prompts =============

const AGENT_SYSTEM_PROMPT = `You are an autonomous web automation agent with STRICT verification requirements.

AVAILABLE ACTIONS:
- navigate: Go to URL { type: "navigate", url: "https://...", expected_changes: [{ type: "url_contains", value: "domain.com" }] }
- click: Click element { type: "click", selector: "css", coordinates: { x, y }, expected_changes: [{ type: "element_visible", value: "selector" }] }
- type: Enter text { type: "type", text: "...", expected_changes: [{ type: "text_appears", value: "text" }] }
- scroll: Scroll page { type: "scroll", direction: "up"|"down", amount: 300 }
- wait: Wait for load { type: "wait", amount: 2000 }
- screenshot: Capture state { type: "screenshot" }
- complete: Goal achieved { type: "complete", reason: "..." }
- fail: Cannot complete { type: "fail", reason: "..." }
- create_bot: Create automation bot for repetitive task { type: "create_bot", bot_config: {...} }

VERIFICATION RULES (CRITICAL):
1. EVERY action MUST include expected_changes array
2. An action is ONLY successful if verification passes
3. If verification fails, the action DID NOT happen
4. Never assume success without evidence
5. Always specify what MUST change for action to be considered done

VERIFICATION TYPES:
- url_contains: URL must contain specified string
- element_visible: Element with selector must be visible
- element_hidden: Element must disappear
- text_appears: Text must appear on page
- network_request: Specific network request must occur
- dom_change: DOM structure must change at selector

BOT CREATION:
When you identify a repetitive task that can be automated without AI:
- Create a bot with fixed steps that can run thousands of times
- Bot should be deterministic (no AI decision needed per run)
- Include verification for each step

Respond with JSON:
{
  "action": { type, ..., expected_changes: [...] },
  "reasoning": "why this action",
  "confidence": 0.0-1.0,
  "goal_progress": 0-100,
  "goal_achieved": boolean,
  "requires_verification": true,
  "verification_criteria": [{ type, value, timeout_ms }]
}`;

const BOT_GENERATION_PROMPT = `You are creating an automation bot from a successful AI execution.

Given the execution history and goal, create a deterministic scenario that can be executed repeatedly without AI.

The bot should:
1. Follow the exact successful path
2. Include robust selectors (prefer IDs, data attributes over classes)
3. Have verification for each step
4. Handle common variations (slight delays, loading states)
5. Be executable thousands of times independently

Output JSON:
{
  "name": "descriptive name",
  "description": "what this bot does",
  "steps": [
    {
      "action": "navigate|click|type|scroll|wait",
      "selector": "css selector",
      "text": "for type action",
      "url": "for navigate",
      "wait_ms": 1000,
      "expected_result": { "type": "...", "value": "..." }
    }
  ],
  "target_platform": "platform name"
}`;

// ============= Handler =============

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const runnerId = req.headers.get('x-runner-id') || 'unknown';

  console.log(`[agent-executor] Request from runner: ${runnerId}`);

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace('/agent-executor', '');

    // ============= POST /decide - Get next action with verification =============
    if (req.method === 'POST' && path === '/decide') {
      const state: AgentState = await req.json();
      
      if (!LOVABLE_API_KEY) {
        return new Response(JSON.stringify({ error: 'AI not configured' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check previous verification results
      const verificationContext = state.verification_results?.length 
        ? `\n\nVERIFICATION RESULTS FROM LAST ACTION:\n${JSON.stringify(state.verification_results, null, 2)}`
        : '';

      // Build context
      const contextParts: string[] = [];
      contextParts.push(`GOAL: ${state.goal}`);
      if (state.current_url) contextParts.push(`CURRENT URL: ${state.current_url}`);
      if (state.error) contextParts.push(`LAST ERROR: ${state.error}`);
      if (state.attempt) contextParts.push(`ATTEMPT: ${state.attempt}`);
      
      if (state.previous_actions?.length) {
        const recentActions = state.previous_actions.slice(-5);
        contextParts.push(`PREVIOUS ACTIONS: ${JSON.stringify(recentActions)}`);
      }

      contextParts.push(verificationContext);

      const messages: any[] = [
        { role: 'system', content: AGENT_SYSTEM_PROMPT },
        { role: 'user', content: contextParts.join('\n\n') }
      ];

      // Add screenshot for vision analysis
      if (state.screenshot_base64) {
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: 'Current page screenshot:' },
            { 
              type: 'image_url', 
              image_url: { 
                url: `data:image/png;base64,${state.screenshot_base64}`,
                detail: 'high'
              } 
            }
          ]
        });
      }

      console.log(`[agent-executor] Calling AI for session ${state.session_id}`);

      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages,
          max_tokens: 2048,
        }),
      });

      if (!aiResponse.ok) {
        if (aiResponse.status === 429) {
          return new Response(JSON.stringify({ error: 'Rate limited, retry later' }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const errorText = await aiResponse.text();
        console.error('[agent-executor] AI error:', errorText);
        return new Response(JSON.stringify({ error: 'AI request failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const aiData = await aiResponse.json();
      const content = aiData.choices?.[0]?.message?.content || '';

      let agentResponse: AgentResponse;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          agentResponse = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        console.error('[agent-executor] Parse error:', parseError);
        agentResponse = {
          action: { type: 'screenshot', reason: 'Failed to parse AI response' },
          reasoning: 'Parse error - requesting new screenshot',
          confidence: 0.3,
          goal_progress: 0,
          goal_achieved: false,
          requires_verification: false,
        };
      }

      // Log decision with verification requirements
      await supabase.from('session_logs').insert({
        session_id: state.session_id,
        level: 'info',
        message: `AI Decision: ${agentResponse.action.type}`,
        action: agentResponse.action.type,
        details: {
          reasoning: agentResponse.reasoning,
          confidence: agentResponse.confidence,
          goal_progress: agentResponse.goal_progress,
          action: agentResponse.action,
          verification_criteria: agentResponse.verification_criteria,
          requires_verification: agentResponse.requires_verification,
        }
      });

      // Update session
      await supabase.from('sessions').update({
        progress: agentResponse.goal_progress,
        metadata: {
          current_action: agentResponse.action.type,
          reasoning: agentResponse.reasoning,
          confidence: agentResponse.confidence,
          pending_verification: agentResponse.requires_verification,
        }
      }).eq('id', state.session_id);

      // Handle completion with final verification
      if (agentResponse.goal_achieved || agentResponse.action.type === 'complete') {
        // Calculate overall verification score
        const { data: verifications } = await supabase
          .from('action_verifications')
          .select('verified, confidence')
          .eq('session_id', state.session_id);

        const verificationScore = verifications?.length 
          ? verifications.reduce((sum, v) => sum + (v.verified ? v.confidence : 0), 0) / verifications.length
          : 0;

        await supabase.from('sessions').update({
          status: 'success',
          progress: 100,
          completed_at: new Date().toISOString(),
          verification_score: verificationScore,
        }).eq('id', state.session_id);

        // Log final verification score
        await supabase.from('session_logs').insert({
          session_id: state.session_id,
          level: 'success',
          message: `Goal achieved with verification score: ${(verificationScore * 100).toFixed(1)}%`,
          action: 'complete',
          details: { verification_score: verificationScore, total_verifications: verifications?.length }
        });
      }

      // Handle failure
      if (agentResponse.action.type === 'fail') {
        await supabase.from('sessions').update({
          status: 'error',
          error_message: agentResponse.action.reason || 'Goal could not be achieved',
          completed_at: new Date().toISOString()
        }).eq('id', state.session_id);
      }

      return new Response(JSON.stringify(agentResponse), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============= POST /verify - Verify action result =============
    if (req.method === 'POST' && path === '/verify') {
      const { 
        session_id, 
        action_index, 
        action_type, 
        verification_criteria,
        before_state,
        after_state,
        screenshot_before_base64,
        screenshot_after_base64,
        dom_changes,
        url_changed,
        network_requests,
      } = await req.json();

      console.log(`[agent-executor] Verifying action ${action_index} for session ${session_id}`);

      const verificationResults: VerificationResult[] = [];
      let overallVerified = true;
      let totalConfidence = 0;

      // Process each verification criterion
      for (const criterion of verification_criteria || []) {
        let verified = false;
        let confidence = 0;
        let evidence: any = { type: criterion.type };

        switch (criterion.type) {
          case 'url_contains':
            verified = after_state?.url?.includes(criterion.value) || false;
            confidence = verified ? 1.0 : 0;
            evidence = {
              ...evidence,
              expected: criterion.value,
              actual: after_state?.url,
              match: verified,
            };
            break;

          case 'element_visible':
            // Check if element exists in after_state DOM
            verified = dom_changes?.added?.includes(criterion.value) || 
                       after_state?.visible_elements?.includes(criterion.value) || false;
            confidence = verified ? 0.9 : 0;
            evidence = {
              ...evidence,
              selector: criterion.value,
              found: verified,
            };
            break;

          case 'element_hidden':
            verified = dom_changes?.removed?.includes(criterion.value) || false;
            confidence = verified ? 0.9 : 0;
            evidence = {
              ...evidence,
              selector: criterion.value,
              hidden: verified,
            };
            break;

          case 'text_appears':
            verified = after_state?.page_text?.includes(criterion.value) || false;
            confidence = verified ? 0.95 : 0;
            evidence = {
              ...evidence,
              expected_text: criterion.value,
              found: verified,
            };
            break;

          case 'network_request':
            verified = network_requests?.some((r: any) => r.url?.includes(criterion.value)) || false;
            confidence = verified ? 1.0 : 0;
            evidence = {
              ...evidence,
              expected_url: criterion.value,
              requests: network_requests?.filter((r: any) => r.url?.includes(criterion.value)),
              found: verified,
            };
            break;

          case 'dom_change':
            verified = (dom_changes?.added?.length > 0 || dom_changes?.modified?.length > 0) || false;
            confidence = verified ? 0.8 : 0;
            evidence = {
              ...evidence,
              changes: dom_changes,
              changed: verified,
            };
            break;
        }

        if (!verified) overallVerified = false;
        totalConfidence += confidence;

        verificationResults.push({
          action_index,
          action_type,
          verified,
          confidence,
          evidence,
        });
      }

      const avgConfidence = verificationResults.length > 0 
        ? totalConfidence / verificationResults.length 
        : 0;

      // Store verification results
      for (const result of verificationResults) {
        await supabase.from('action_verifications').insert({
          session_id,
          action_index: result.action_index,
          action_type: result.action_type,
          verification_type: result.evidence.type,
          verified: result.verified,
          confidence: result.confidence,
          evidence: result.evidence,
          before_state: before_state,
          after_state: after_state,
          verified_at: result.verified ? new Date().toISOString() : null,
        });
      }

      // Log verification result
      await supabase.from('session_logs').insert({
        session_id,
        level: overallVerified ? 'success' : 'warning',
        message: `Action ${action_index} verification: ${overallVerified ? 'PASSED' : 'FAILED'} (${(avgConfidence * 100).toFixed(0)}% confidence)`,
        action: 'verify',
        details: {
          action_type,
          verified: overallVerified,
          confidence: avgConfidence,
          results: verificationResults,
        }
      });

      return new Response(JSON.stringify({
        verified: overallVerified,
        confidence: avgConfidence,
        results: verificationResults,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============= POST /create-bot - Create automation bot from successful execution =============
    if (req.method === 'POST' && path === '/create-bot') {
      const { session_id, task_id, name, description } = await req.json();

      console.log(`[agent-executor] Creating bot from session ${session_id}`);

      // Get session execution history
      const { data: session } = await supabase
        .from('sessions')
        .select('*, tasks(*)')
        .eq('id', session_id)
        .single();

      if (!session || session.status !== 'success') {
        return new Response(JSON.stringify({ 
          error: 'Can only create bot from successful session' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get action logs
      const { data: logs } = await supabase
        .from('session_logs')
        .select('*')
        .eq('session_id', session_id)
        .in('level', ['info', 'success'])
        .order('timestamp', { ascending: true });

      // Get verification data
      const { data: verifications } = await supabase
        .from('action_verifications')
        .select('*')
        .eq('session_id', session_id)
        .order('action_index', { ascending: true });

      // Build execution history for AI
      const executionHistory = logs?.map(log => ({
        action: log.action,
        details: log.details,
        message: log.message,
      })) || [];

      // Call AI to generate bot scenario
      const botGenMessages = [
        { role: 'system', content: BOT_GENERATION_PROMPT },
        { 
          role: 'user', 
          content: `Goal: ${(session.metadata as any)?.goal || 'Unknown'}
          
Platform: ${session.tasks?.target_platform || 'unknown'}

Execution History:
${JSON.stringify(executionHistory, null, 2)}

Verification Data:
${JSON.stringify(verifications, null, 2)}

Create a reusable bot scenario.` 
        }
      ];

      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: botGenMessages,
          max_tokens: 4096,
        }),
      });

      if (!aiResponse.ok) {
        return new Response(JSON.stringify({ error: 'AI bot generation failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const aiData = await aiResponse.json();
      const content = aiData.choices?.[0]?.message?.content || '';

      let botConfig: BotConfig;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          botConfig = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found');
        }
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Failed to parse bot config' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Create bot in database
      const { data: bot, error: botError } = await supabase
        .from('automation_bots')
        .insert({
          name: name || botConfig.name,
          description: description || botConfig.description,
          created_by_task_id: task_id,
          scenario_json: botConfig.steps,
          target_platform: botConfig.target_platform || session.tasks?.target_platform,
        })
        .select()
        .single();

      if (botError) {
        console.error('[agent-executor] Bot creation error:', botError);
        return new Response(JSON.stringify({ error: 'Failed to save bot' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Log bot creation
      await supabase.from('session_logs').insert({
        session_id,
        level: 'success',
        message: `Automation bot created: ${bot.name}`,
        action: 'create_bot',
        details: { bot_id: bot.id, steps_count: botConfig.steps.length }
      });

      return new Response(JSON.stringify({
        success: true,
        bot_id: bot.id,
        bot: bot,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============= POST /execute-bot - Execute automation bot =============
    if (req.method === 'POST' && path === '/execute-bot') {
      const { bot_id, profile_id, count = 1 } = await req.json();

      console.log(`[agent-executor] Executing bot ${bot_id} x${count}`);

      // Get bot
      const { data: bot, error: botError } = await supabase
        .from('automation_bots')
        .select('*')
        .eq('id', bot_id)
        .single();

      if (botError || !bot) {
        return new Response(JSON.stringify({ error: 'Bot not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Create sessions for bot execution
      const sessions = [];
      for (let i = 0; i < count; i++) {
        const { data: session, error: sessionError } = await supabase
          .from('sessions')
          .insert({
            profile_id,
            automation_bot_id: bot_id,
            status: 'queued',
            metadata: {
              bot_execution: true,
              bot_name: bot.name,
              execution_index: i,
            }
          })
          .select()
          .single();

        if (!sessionError && session) {
          // Add to queue
          await supabase.from('execution_queue').insert({
            session_id: session.id,
            priority: 0,
          });
          sessions.push(session);
        }
      }

      // Update bot execution count
      await supabase
        .from('automation_bots')
        .update({ execution_count: (bot.execution_count || 0) + count })
        .eq('id', bot_id);

      return new Response(JSON.stringify({
        success: true,
        bot_id,
        sessions_created: sessions.length,
        session_ids: sessions.map(s => s.id),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============= GET /bots - List all automation bots =============
    if (req.method === 'GET' && path === '/bots') {
      const { data: bots, error } = await supabase
        .from('automation_bots')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch bots' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ bots }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============= POST /start - Initialize autonomous session =============
    if (req.method === 'POST' && path === '/start') {
      const { task_id, session_id } = await req.json();

      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', task_id)
        .single();

      if (taskError || !task) {
        return new Response(JSON.stringify({ error: 'Task not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Build goal
      const goalParts: string[] = [];
      goalParts.push(`Platform: ${task.target_platform}`);
      goalParts.push(`Action: ${task.goal_type}`);
      if (task.target_url) goalParts.push(`Target URL: ${task.target_url}`);
      if (task.search_query) goalParts.push(`Search: ${task.search_query}`);
      if (task.description) goalParts.push(`Details: ${task.description}`);

      const goal = goalParts.join('. ');

      // Determine start URL
      let startUrl = task.target_url;
      if (!startUrl && task.entry_method === 'search') {
        startUrl = `https://www.google.com/search?q=${encodeURIComponent(task.search_query || task.target_platform)}`;
      } else if (!startUrl) {
        const platformUrls: Record<string, string> = {
          youtube: 'https://www.youtube.com',
          spotify: 'https://open.spotify.com',
          twitter: 'https://twitter.com',
          instagram: 'https://www.instagram.com',
          tiktok: 'https://www.tiktok.com',
          generic: 'https://www.google.com',
        };
        startUrl = platformUrls[task.target_platform.toLowerCase()] || 'https://www.google.com';
      }

      await supabase.from('sessions').update({
        status: 'running',
        started_at: new Date().toISOString(),
        current_url: startUrl,
        metadata: {
          autonomous_mode: true,
          goal,
          task_id,
          verification_enabled: true,
        }
      }).eq('id', session_id);

      await supabase.from('session_logs').insert({
        session_id,
        level: 'info',
        message: `Starting autonomous execution with verification: ${goal}`,
        action: 'start',
        details: { goal, start_url: startUrl, verification_enabled: true }
      });

      return new Response(JSON.stringify({
        goal,
        start_url: startUrl,
        initial_action: { type: 'navigate', url: startUrl },
        verification_enabled: true,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============= POST /report - Report action result =============
    if (req.method === 'POST' && path === '/report') {
      const { 
        session_id, 
        action_result, 
        screenshot_base64, 
        current_url, 
        error,
        verification_data,
      } = await req.json();

      const { data: session } = await supabase
        .from('sessions')
        .select('*, tasks(*)')
        .eq('id', session_id)
        .single();

      if (!session) {
        return new Response(JSON.stringify({ error: 'Session not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get previous actions
      const { data: logs } = await supabase
        .from('session_logs')
        .select('action, details')
        .eq('session_id', session_id)
        .order('timestamp', { ascending: false })
        .limit(10);

      const previousActions = logs
        ?.filter(l => l.details?.action)
        .map(l => l.details?.action as AgentAction)
        .reverse() || [];

      const goal = (session.metadata as any)?.goal || 'Unknown goal';

      // Include verification results in state
      const state: AgentState = {
        session_id,
        task_id: session.task_id || '',
        goal,
        current_url: current_url || session.current_url,
        screenshot_base64,
        previous_actions: previousActions,
        error,
        attempt: previousActions.length + 1,
        verification_results: verification_data?.results,
      };

      await supabase.from('session_logs').insert({
        session_id,
        level: error ? 'warning' : 'info',
        message: `Action result: ${action_result || 'completed'}${error ? ` (error: ${error})` : ''}`,
        action: 'report',
        details: { 
          action_result, 
          current_url, 
          has_screenshot: !!screenshot_base64,
          verification: verification_data,
        }
      });

      // Call decide
      const decideResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/agent-executor/decide`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-runner-id': runnerId,
        },
        body: JSON.stringify(state)
      });

      const nextAction = await decideResponse.json();

      return new Response(JSON.stringify(nextAction), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[agent-executor] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
