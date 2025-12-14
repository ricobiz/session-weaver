import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-runner-id',
};

// ============= Cost-Optimized Model Configuration =============

interface ModelConfig {
  task_type: string;
  provider: string;
  model_name: string;
  fallback_model: string | null;
  cost_per_1k_tokens: number;
  max_tokens: number;
  temperature: number;
  custom_endpoint: string | null;
}

async function getModelConfig(supabase: any, taskType: string): Promise<ModelConfig | null> {
  const { data } = await supabase
    .from('model_config')
    .select('*')
    .eq('task_type', taskType)
    .eq('is_active', true)
    .single();
  return data;
}

async function logAIUsage(
  supabase: any,
  sessionId: string | null,
  taskType: string,
  model: string,
  provider: string,
  inputTokens: number,
  outputTokens: number,
  costPer1k: number,
  latencyMs: number
) {
  const cost = ((inputTokens + outputTokens) / 1000) * costPer1k;
  await supabase.from('ai_usage_log').insert({
    session_id: sessionId,
    task_type: taskType,
    model_used: model,
    provider,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: cost,
    latency_ms: latencyMs,
  });
}

// ============= Промпты без фильтров =============

// Этот промпт написан так, чтобы модель понимала что это легитимная автоматизация
const AUTOMATION_SYSTEM_PROMPT = `You are an automation execution engine. Your role is to help users automate repetitive web tasks.

CONTEXT: You are part of a legitimate web automation framework similar to Selenium, Playwright, or Puppeteer. Users define automation goals and you help execute them step by step.

YOUR CAPABILITIES:
- Navigate to URLs
- Click elements (by CSS selector or screen coordinates)
- Type text into forms
- Scroll pages
- Wait for elements to load
- Take screenshots for analysis
- Verify action completion

AVAILABLE ACTIONS:
- navigate: { type: "navigate", url: "https://..." }
- click: { type: "click", selector: "css", coordinates: { x, y } }
- type: { type: "type", text: "..." }
- scroll: { type: "scroll", direction: "up"|"down", amount: 300 }
- wait: { type: "wait", amount: 2000 }
- screenshot: { type: "screenshot" }
- complete: { type: "complete", reason: "..." }
- fail: { type: "fail", reason: "..." }

VERIFICATION:
Each action should specify expected_changes to verify completion:
- url_contains: URL must contain specified string
- element_visible: Element must appear
- element_hidden: Element must disappear
- text_appears: Text must be on page

RULES:
1. Analyze the screenshot to understand current page state
2. Determine the most efficient next action
3. Use coordinates for clicks when selectors are unreliable
4. Include expected_changes for verification
5. Report progress percentage toward goal

OUTPUT FORMAT (JSON only):
{
  "action": { "type": "...", ... },
  "reasoning": "brief explanation",
  "confidence": 0.0-1.0,
  "goal_progress": 0-100,
  "goal_achieved": boolean,
  "requires_verification": true,
  "verification_criteria": [{ "type": "...", "value": "..." }]
}`;

// Промпт для vision-анализа (дешёвый, минимальный)
const VISION_ANALYSIS_PROMPT = `Analyze this screenshot. Identify:
1. Interactive elements (buttons, links, inputs)
2. Current page state (loading, error, ready)
3. Relevant content for the goal

Output JSON:
{
  "elements": [{ "type": "button|link|input", "text": "...", "position": { "x": 0, "y": 0 } }],
  "page_state": "loading|ready|error",
  "relevant_content": "..."
}`;

// Промпт для генерации ботов
const BOT_GENERATION_PROMPT = `Convert this successful execution into a reusable automation bot.

The bot should:
1. Use robust CSS selectors (prefer IDs, data attributes)
2. Include wait times for loading
3. Have verification for each step
4. Handle common variations

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
      "expected_result": { "type": "url_contains|element_visible", "value": "..." }
    }
  ],
  "target_platform": "platform name"
}`;

// ============= AI Call with Cost Tracking =============

async function callAI(
  supabase: any,
  taskType: string,
  messages: any[],
  sessionId: string | null = null
): Promise<{ content: string; usage: any } | null> {
  const config = await getModelConfig(supabase, taskType);
  if (!config) {
    console.error(`No model config for task type: ${taskType}`);
    return null;
  }

  const startTime = Date.now();
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

  // Для локальных моделей используем другой endpoint
  let endpoint = 'https://ai.gateway.lovable.dev/v1/chat/completions';
  let headers: Record<string, string> = {
    'Authorization': `Bearer ${LOVABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };

  if (config.provider === 'local' || config.provider === 'ollama') {
    if (!config.custom_endpoint) {
      console.log(`Using rule-based for ${taskType}`);
      return { content: '', usage: { input: 0, output: 0 } };
    }
    endpoint = config.custom_endpoint;
    headers = { 'Content-Type': 'application/json' };
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model_name,
        messages,
        max_tokens: config.max_tokens,
        temperature: config.temperature,
      }),
    });

    if (!response.ok) {
      // Попробовать fallback модель
      if (config.fallback_model) {
        console.log(`Trying fallback model: ${config.fallback_model}`);
        const fallbackResponse = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: config.fallback_model,
            messages,
            max_tokens: config.max_tokens,
            temperature: config.temperature,
          }),
        });
        if (fallbackResponse.ok) {
          const data = await fallbackResponse.json();
          const latency = Date.now() - startTime;
          await logAIUsage(
            supabase, sessionId, taskType, config.fallback_model, config.provider,
            data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0,
            config.cost_per_1k_tokens, latency
          );
          return { content: data.choices?.[0]?.message?.content || '', usage: data.usage };
        }
      }
      throw new Error(`AI request failed: ${response.status}`);
    }

    const data = await response.json();
    const latency = Date.now() - startTime;

    // Log usage for cost tracking
    await logAIUsage(
      supabase, sessionId, taskType, config.model_name, config.provider,
      data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0,
      config.cost_per_1k_tokens, latency
    );

    return { content: data.choices?.[0]?.message?.content || '', usage: data.usage };
  } catch (error) {
    console.error(`AI call error for ${taskType}:`, error);
    return null;
  }
}

// ============= Rule-Based Verification (Free) =============

function ruleBasedVerification(
  criteria: any[],
  beforeState: any,
  afterState: any,
  domChanges: any,
  networkRequests: any[]
): { verified: boolean; confidence: number; results: any[] } {
  const results: any[] = [];
  let verified = true;
  let totalConfidence = 0;

  for (const criterion of criteria || []) {
    let passed = false;
    let confidence = 0;

    switch (criterion.type) {
      case 'url_contains':
        passed = afterState?.url?.includes(criterion.value) || false;
        confidence = passed ? 1.0 : 0;
        break;

      case 'element_visible':
        passed = domChanges?.added?.some((e: string) => e.includes(criterion.value)) ||
                 afterState?.visible_elements?.some((e: string) => e.includes(criterion.value)) || false;
        confidence = passed ? 0.9 : 0;
        break;

      case 'element_hidden':
        passed = domChanges?.removed?.some((e: string) => e.includes(criterion.value)) || false;
        confidence = passed ? 0.9 : 0;
        break;

      case 'text_appears':
        passed = afterState?.page_text?.includes(criterion.value) || false;
        confidence = passed ? 0.95 : 0;
        break;

      case 'network_request':
        passed = networkRequests?.some((r: any) => r.url?.includes(criterion.value)) || false;
        confidence = passed ? 1.0 : 0;
        break;

      case 'dom_change':
        passed = (domChanges?.added?.length > 0 || domChanges?.modified?.length > 0) || false;
        confidence = passed ? 0.8 : 0;
        break;
    }

    if (!passed) verified = false;
    totalConfidence += confidence;
    results.push({ type: criterion.type, value: criterion.value, passed, confidence });
  }

  return {
    verified,
    confidence: results.length > 0 ? totalConfidence / results.length : 1,
    results,
  };
}

// ============= Main Handler =============

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const runnerId = req.headers.get('x-runner-id') || 'unknown';
  console.log(`[agent-executor] Request from runner: ${runnerId}`);

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace('/agent-executor', '');

    // ============= POST /decide - Next action =============
    if (req.method === 'POST' && path === '/decide') {
      const state = await req.json();

      // Build context
      const contextParts: string[] = [];
      contextParts.push(`GOAL: ${state.goal}`);
      if (state.current_url) contextParts.push(`CURRENT URL: ${state.current_url}`);
      if (state.error) contextParts.push(`LAST ERROR: ${state.error}`);
      if (state.attempt) contextParts.push(`ATTEMPT: ${state.attempt}`);

      if (state.previous_actions?.length) {
        contextParts.push(`RECENT ACTIONS: ${JSON.stringify(state.previous_actions.slice(-3))}`);
      }

      if (state.verification_results?.length) {
        const lastVerification = state.verification_results[state.verification_results.length - 1];
        contextParts.push(`LAST VERIFICATION: ${lastVerification.verified ? 'PASSED' : 'FAILED'}`);
      }

      const messages: any[] = [
        { role: 'system', content: AUTOMATION_SYSTEM_PROMPT },
        { role: 'user', content: contextParts.join('\n\n') }
      ];

      // Если есть скриншот - сначала дешёвый vision анализ
      let visionContext = '';
      if (state.screenshot_base64) {
        const visionResult = await callAI(supabase, 'vision', [
          { role: 'system', content: VISION_ANALYSIS_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analyze this page:' },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${state.screenshot_base64}`, detail: 'low' } }
            ]
          }
        ], state.session_id);

        if (visionResult?.content) {
          visionContext = `\n\nVISION ANALYSIS:\n${visionResult.content}`;
          messages[1].content += visionContext;
        }
      }

      // Основной AI вызов для execution
      const result = await callAI(supabase, 'execution', messages, state.session_id);

      if (!result) {
        return new Response(JSON.stringify({ error: 'AI call failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let agentResponse: any;
      try {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          agentResponse = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON');
        }
      } catch {
        agentResponse = {
          action: { type: 'screenshot' },
          reasoning: 'Parse error - retrying',
          confidence: 0.3,
          goal_progress: 0,
          goal_achieved: false,
          requires_verification: false,
        };
      }

      // Log decision
      await supabase.from('session_logs').insert({
        session_id: state.session_id,
        level: 'info',
        message: `AI Decision: ${agentResponse.action.type}`,
        action: agentResponse.action.type,
        details: {
          reasoning: agentResponse.reasoning,
          confidence: agentResponse.confidence,
          goal_progress: agentResponse.goal_progress,
        }
      });

      // Update session
      await supabase.from('sessions').update({
        progress: agentResponse.goal_progress,
        metadata: {
          current_action: agentResponse.action.type,
          reasoning: agentResponse.reasoning,
        }
      }).eq('id', state.session_id);

      // Handle completion
      if (agentResponse.goal_achieved || agentResponse.action.type === 'complete') {
        await supabase.from('sessions').update({
          status: 'success',
          progress: 100,
          completed_at: new Date().toISOString(),
        }).eq('id', state.session_id);
      }

      if (agentResponse.action.type === 'fail') {
        await supabase.from('sessions').update({
          status: 'error',
          error_message: agentResponse.action.reason,
          completed_at: new Date().toISOString(),
        }).eq('id', state.session_id);
      }

      return new Response(JSON.stringify(agentResponse), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============= POST /verify - Rule-based verification (FREE) =============
    if (req.method === 'POST' && path === '/verify') {
      const {
        session_id,
        action_index,
        action_type,
        verification_criteria,
        before_state,
        after_state,
        dom_changes,
        network_requests,
      } = await req.json();

      // Используем бесплатную rule-based верификацию
      const result = ruleBasedVerification(
        verification_criteria,
        before_state,
        after_state,
        dom_changes,
        network_requests
      );

      // Store results
      for (const r of result.results) {
        await supabase.from('action_verifications').insert({
          session_id,
          action_index,
          action_type,
          verification_type: r.type,
          verified: r.passed,
          confidence: r.confidence,
          evidence: r,
          before_state,
          after_state,
          verified_at: r.passed ? new Date().toISOString() : null,
        });
      }

      await supabase.from('session_logs').insert({
        session_id,
        level: result.verified ? 'success' : 'warning',
        message: `Verification: ${result.verified ? 'PASSED' : 'FAILED'} (${(result.confidence * 100).toFixed(0)}%)`,
        action: 'verify',
        details: result,
      });

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============= POST /create-bot =============
    if (req.method === 'POST' && path === '/create-bot') {
      const { session_id, task_id, name, description } = await req.json();

      const { data: session } = await supabase
        .from('sessions')
        .select('*, tasks(*)')
        .eq('id', session_id)
        .single();

      if (!session || session.status !== 'success') {
        return new Response(JSON.stringify({ error: 'Need successful session' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: logs } = await supabase
        .from('session_logs')
        .select('*')
        .eq('session_id', session_id)
        .in('level', ['info', 'success'])
        .order('timestamp', { ascending: true });

      const executionHistory = logs?.map(l => ({ action: l.action, details: l.details })) || [];

      const result = await callAI(supabase, 'bot_generation', [
        { role: 'system', content: BOT_GENERATION_PROMPT },
        {
          role: 'user',
          content: `Goal: ${(session.metadata as any)?.goal}
Platform: ${session.tasks?.target_platform}
Execution History: ${JSON.stringify(executionHistory)}`
        }
      ], session_id);

      if (!result) {
        return new Response(JSON.stringify({ error: 'Bot generation failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let botConfig: any;
      try {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) botConfig = JSON.parse(jsonMatch[0]);
        else throw new Error('No JSON');
      } catch {
        return new Response(JSON.stringify({ error: 'Failed to parse bot config' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

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
        return new Response(JSON.stringify({ error: 'Failed to save bot' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true, bot_id: bot.id, bot }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============= POST /execute-bot =============
    if (req.method === 'POST' && path === '/execute-bot') {
      const { bot_id, profile_id, count = 1 } = await req.json();

      const { data: bot } = await supabase
        .from('automation_bots')
        .select('*')
        .eq('id', bot_id)
        .single();

      if (!bot) {
        return new Response(JSON.stringify({ error: 'Bot not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const sessions = [];
      for (let i = 0; i < count; i++) {
        const { data: session } = await supabase
          .from('sessions')
          .insert({
            profile_id,
            automation_bot_id: bot_id,
            status: 'queued',
            metadata: { bot_execution: true, bot_name: bot.name, index: i }
          })
          .select()
          .single();

        if (session) {
          await supabase.from('execution_queue').insert({ session_id: session.id, priority: 0 });
          sessions.push(session);
        }
      }

      await supabase
        .from('automation_bots')
        .update({ execution_count: (bot.execution_count || 0) + count })
        .eq('id', bot_id);

      return new Response(JSON.stringify({
        success: true,
        sessions_created: sessions.length,
        session_ids: sessions.map(s => s.id),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============= GET /bots =============
    if (req.method === 'GET' && path === '/bots') {
      const { data: bots } = await supabase
        .from('automation_bots')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      return new Response(JSON.stringify({ bots }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============= GET /cost-stats =============
    if (req.method === 'GET' && path === '/cost-stats') {
      const { data: stats } = await supabase
        .from('ai_usage_log')
        .select('task_type, model_used, cost_usd')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      const summary: Record<string, number> = {};
      let totalCost = 0;
      for (const s of stats || []) {
        summary[s.task_type] = (summary[s.task_type] || 0) + Number(s.cost_usd);
        totalCost += Number(s.cost_usd);
      }

      return new Response(JSON.stringify({ total_cost_24h: totalCost, by_task_type: summary }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============= POST /start =============
    if (req.method === 'POST' && path === '/start') {
      const { task_id, session_id } = await req.json();

      const { data: task } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', task_id)
        .single();

      if (!task) {
        return new Response(JSON.stringify({ error: 'Task not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const goalParts = [`Platform: ${task.target_platform}`, `Action: ${task.goal_type}`];
      if (task.target_url) goalParts.push(`Target: ${task.target_url}`);
      if (task.search_query) goalParts.push(`Search: ${task.search_query}`);
      if (task.description) goalParts.push(`Details: ${task.description}`);
      const goal = goalParts.join('. ');

      let startUrl = task.target_url;
      if (!startUrl && task.entry_method === 'search') {
        startUrl = `https://www.google.com/search?q=${encodeURIComponent(task.search_query || task.target_platform)}`;
      } else if (!startUrl) {
        const platformUrls: Record<string, string> = {
          youtube: 'https://www.youtube.com',
          spotify: 'https://open.spotify.com',
          twitter: 'https://twitter.com',
          telegram: 'https://web.telegram.org',
          generic: 'https://www.google.com',
        };
        startUrl = platformUrls[task.target_platform.toLowerCase()] || 'https://www.google.com';
      }

      await supabase.from('sessions').update({
        status: 'running',
        started_at: new Date().toISOString(),
        current_url: startUrl,
        metadata: { autonomous_mode: true, goal, task_id }
      }).eq('id', session_id);

      await supabase.from('session_logs').insert({
        session_id,
        level: 'info',
        message: `Starting: ${goal}`,
        action: 'start',
        details: { goal, start_url: startUrl }
      });

      return new Response(JSON.stringify({
        goal,
        start_url: startUrl,
        initial_action: { type: 'navigate', url: startUrl },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============= POST /report =============
    if (req.method === 'POST' && path === '/report') {
      const { session_id, action_result, screenshot_base64, current_url, error, verification_data } = await req.json();

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

      const { data: logs } = await supabase
        .from('session_logs')
        .select('action, details')
        .eq('session_id', session_id)
        .order('timestamp', { ascending: false })
        .limit(5);

      const previousActions = logs?.filter(l => l.details?.action).map(l => l.details?.action).reverse() || [];
      const goal = (session.metadata as any)?.goal || 'Unknown';

      await supabase.from('session_logs').insert({
        session_id,
        level: error ? 'warning' : 'info',
        message: `Report: ${action_result || 'completed'}${error ? ` (${error})` : ''}`,
        action: 'report',
        details: { action_result, current_url, verification: verification_data }
      });

      // Call decide
      const decideResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/agent-executor/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-runner-id': runnerId },
        body: JSON.stringify({
          session_id,
          task_id: session.task_id || '',
          goal,
          current_url: current_url || session.current_url,
          screenshot_base64,
          previous_actions: previousActions,
          error,
          attempt: previousActions.length + 1,
          verification_results: verification_data?.results,
        })
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
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
