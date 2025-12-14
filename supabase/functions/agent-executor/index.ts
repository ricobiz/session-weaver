import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-runner-id',
};

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
}

interface AgentAction {
  type: 'navigate' | 'click' | 'type' | 'scroll' | 'wait' | 'screenshot' | 'complete' | 'fail';
  selector?: string;
  text?: string;
  url?: string;
  direction?: 'up' | 'down';
  amount?: number;
  reason?: string;
  coordinates?: { x: number; y: number };
}

interface AgentResponse {
  action: AgentAction;
  reasoning: string;
  confidence: number;
  goal_progress: number; // 0-100
  goal_achieved: boolean;
}

const SYSTEM_PROMPT = `You are an autonomous web automation agent. Your job is to analyze screenshots and page state, then decide the next action to achieve the user's goal.

You have access to these actions:
- navigate: Go to a URL { type: "navigate", url: "https://..." }
- click: Click on an element { type: "click", selector: "css selector", coordinates: { x, y } }
- type: Type text into focused element { type: "type", text: "..." }
- scroll: Scroll the page { type: "scroll", direction: "up"|"down", amount: 300 }
- wait: Wait for page load { type: "wait", amount: 2000 }
- screenshot: Take screenshot to analyze { type: "screenshot" }
- complete: Goal achieved { type: "complete", reason: "..." }
- fail: Cannot complete goal { type: "fail", reason: "..." }

Rules:
1. Analyze the screenshot/page state carefully before acting
2. Prefer clicking by coordinates if CSS selectors might be unreliable
3. Always explain your reasoning
4. Estimate goal progress (0-100%)
5. If stuck, try alternative approaches before failing
6. Be patient with loading states - use wait action
7. For video/audio playback, look for play buttons or autoplay indicators

Respond with JSON only:
{
  "action": { ... action object ... },
  "reasoning": "explanation of why this action",
  "confidence": 0.0-1.0,
  "goal_progress": 0-100,
  "goal_achieved": boolean
}`;

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

    // POST /decide - Get next action based on current state
    if (req.method === 'POST' && path === '/decide') {
      const state: AgentState = await req.json();
      
      if (!LOVABLE_API_KEY) {
        return new Response(JSON.stringify({ error: 'AI not configured' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Build context message
      const contextParts: string[] = [];
      contextParts.push(`GOAL: ${state.goal}`);
      if (state.current_url) contextParts.push(`CURRENT URL: ${state.current_url}`);
      if (state.error) contextParts.push(`LAST ERROR: ${state.error}`);
      if (state.attempt) contextParts.push(`ATTEMPT: ${state.attempt}`);
      
      if (state.previous_actions?.length) {
        const recentActions = state.previous_actions.slice(-5);
        contextParts.push(`PREVIOUS ACTIONS: ${JSON.stringify(recentActions)}`);
      }

      const messages: any[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: contextParts.join('\n\n') }
      ];

      // Add screenshot if provided (vision model)
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
          model: 'google/gemini-2.5-flash', // Fast vision model
          messages,
          max_tokens: 1024,
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

      // Parse JSON response
      let agentResponse: AgentResponse;
      try {
        // Extract JSON from response (might be wrapped in markdown)
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          agentResponse = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        console.error('[agent-executor] Parse error:', parseError, 'Content:', content);
        // Fallback action
        agentResponse = {
          action: { type: 'screenshot', reason: 'Failed to parse AI response, retrying' },
          reasoning: 'Parse error - requesting new screenshot for retry',
          confidence: 0.3,
          goal_progress: 0,
          goal_achieved: false
        };
      }

      // Log the decision
      await supabase.from('session_logs').insert({
        session_id: state.session_id,
        level: 'info',
        message: `AI Decision: ${agentResponse.action.type}`,
        action: agentResponse.action.type,
        details: {
          reasoning: agentResponse.reasoning,
          confidence: agentResponse.confidence,
          goal_progress: agentResponse.goal_progress,
          action: agentResponse.action
        }
      });

      // Update session progress
      if (agentResponse.goal_progress > 0) {
        await supabase.from('sessions').update({
          progress: agentResponse.goal_progress,
          metadata: {
            current_action: agentResponse.action.type,
            reasoning: agentResponse.reasoning,
            confidence: agentResponse.confidence
          }
        }).eq('id', state.session_id);
      }

      // Handle completion
      if (agentResponse.goal_achieved || agentResponse.action.type === 'complete') {
        await supabase.from('sessions').update({
          status: 'success',
          progress: 100,
          completed_at: new Date().toISOString()
        }).eq('id', state.session_id);
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

    // POST /start - Initialize autonomous session from task
    if (req.method === 'POST' && path === '/start') {
      const { task_id, session_id } = await req.json();

      // Get task details
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

      // Build goal from task
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
        // Google search as starting point
        startUrl = `https://www.google.com/search?q=${encodeURIComponent(task.search_query || task.target_platform)}`;
      } else if (!startUrl) {
        // Platform-specific default URLs
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

      // Update session to running state
      await supabase.from('sessions').update({
        status: 'running',
        started_at: new Date().toISOString(),
        current_url: startUrl,
        metadata: {
          autonomous_mode: true,
          goal,
          task_id
        }
      }).eq('id', session_id);

      // Log start
      await supabase.from('session_logs').insert({
        session_id,
        level: 'info',
        message: `Starting autonomous execution: ${goal}`,
        action: 'start',
        details: { goal, start_url: startUrl }
      });

      // Return initial action
      const initialAction: AgentAction = {
        type: 'navigate',
        url: startUrl
      };

      return new Response(JSON.stringify({
        goal,
        start_url: startUrl,
        initial_action: initialAction
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /report - Report action result and get next action
    if (req.method === 'POST' && path === '/report') {
      const { session_id, action_result, screenshot_base64, current_url, error } = await req.json();

      // Get session with task details
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select(`
          *,
          tasks (*)
        `)
        .eq('id', session_id)
        .single();

      if (sessionError || !session) {
        return new Response(JSON.stringify({ error: 'Session not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get previous actions from logs
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

      // Get goal from session metadata
      const goal = (session.metadata as any)?.goal || 'Unknown goal';

      // Build state for AI decision
      const state: AgentState = {
        session_id,
        task_id: session.task_id || '',
        goal,
        current_url: current_url || session.current_url,
        screenshot_base64,
        previous_actions: previousActions,
        error,
        attempt: previousActions.length + 1
      };

      // Log the report
      await supabase.from('session_logs').insert({
        session_id,
        level: error ? 'warning' : 'info',
        message: `Action result: ${action_result || 'completed'}${error ? ` (error: ${error})` : ''}`,
        action: 'report',
        details: { action_result, current_url, has_screenshot: !!screenshot_base64 }
      });

      // Call /decide internally
      const decideRequest = new Request(`${req.url.replace('/report', '/decide')}`, {
        method: 'POST',
        headers: req.headers,
        body: JSON.stringify(state)
      });

      // Forward to decide handler
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
