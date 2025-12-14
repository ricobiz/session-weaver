import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-runner-id',
};

// ============= OpenRouter Configuration =============

const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions';

// Дешёвые модели для разных задач
const MODELS = {
  // Для планирования и execution - нужен reasoning
  execution: 'google/gemini-2.5-flash', // ~$0.10/1M
  // Для vision - дешёвый с поддержкой изображений
  vision: 'google/gemini-2.5-flash', // ~$0.10/1M с vision
  // Для генерации ботов
  bot_generation: 'google/gemini-2.5-flash', // ~$0.10/1M
  // Альтернативы ещё дешевле:
  // 'google/gemini-2.0-flash-lite-001' - ещё дешевле
  // 'mistralai/mistral-small-3.1-24b-instruct' - ~$0.10/1M, без цензуры
  // 'qwen/qwen3-30b-a3b' - ~$0.07/1M, без цензуры
};

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

// ============= Промпты для автоматизации =============

const AUTOMATION_SYSTEM_PROMPT = `You are an AUTONOMOUS web automation agent. You receive simple natural language goals and figure out everything yourself.

CRITICAL RULES:
1. User gives simple commands like "зарегистрируйся", "залогинься", "подпишись" - YOU decide HOW to do it
2. When registration/signup is needed - YOU GENERATE random credentials:
   - Username: random like "user_" + random 6 chars (e.g. user_x7k2m9)
   - Password: secure like "Pass_" + random 6 chars + "!" (e.g. Pass_a3b8k2!)
   - Email: random like username + "@tempmail.test"
3. ALWAYS remember what credentials you generated - you MUST return them at the end
4. Analyze screenshots to find interactive elements and their PIXEL COORDINATES
5. Click actions MUST include coordinates {x, y} - calculate from screenshot analysis
6. Self-verify each action worked before proceeding

AVAILABLE ACTIONS:
- navigate: { type: "navigate", url: "https://..." }
- click: { type: "click", coordinates: { x: 500, y: 300 } }  // ALWAYS use coordinates!
- type: { type: "type", text: "..." }  // Types into currently focused element
- scroll: { type: "scroll", direction: "up"|"down", amount: 300 }
- wait: { type: "wait", amount: 2000 }
- complete: { type: "complete", reason: "...", generated_data: { username, password, email, ... } }
- fail: { type: "fail", reason: "..." }

WORKFLOW FOR REGISTRATION:
1. Analyze page - find registration/signup button or link
2. Click it using coordinates from screenshot
3. Wait for form to load
4. Find each input field (username, email, password, etc.)
5. Click on field → type value → move to next
6. Find and click submit button
7. Verify success (URL change, welcome message, etc.)
8. Return generated credentials in "complete" action

OUTPUT FORMAT (only valid JSON):
{
  "action": { "type": "...", "coordinates": { "x": 0, "y": 0 }, "text": "...", ... },
  "reasoning": "what I'm doing and why",
  "confidence": 0.0-1.0,
  "goal_progress": 0-100,
  "goal_achieved": false,
  "generated_data": { "username": "...", "password": "...", "email": "..." },
  "requires_verification": true,
  "verification_criteria": [{ "type": "url_contains|element_visible|text_appears", "value": "..." }]
}

IMPORTANT: When goal is achieved, use action type "complete" and include ALL generated_data!`;

const VISION_ANALYSIS_PROMPT = `You are analyzing a screenshot to help with web automation.

Your task:
1. Identify ALL interactive elements (buttons, links, input fields, checkboxes)
2. For EACH element provide EXACT pixel coordinates (center of element)
3. Identify the current page state and what action is needed

Look for:
- Registration/Signup buttons or links
- Login forms
- Input fields (username, email, password, etc.)
- Submit/Continue buttons
- Error messages or success indicators

Output JSON:
{
  "page_type": "login|registration|home|profile|other",
  "elements": [
    { 
      "type": "button|link|input|checkbox", 
      "purpose": "signup|login|submit|username_field|email_field|password_field|other",
      "text": "visible text or placeholder",
      "position": { "x": 500, "y": 300 },
      "size": { "width": 100, "height": 40 }
    }
  ],
  "page_state": "loading|ready|error|success",
  "suggested_next_action": "click signup button at (x, y)|fill username field|submit form|etc",
  "visible_errors": ["error message if any"],
  "success_indicators": ["success message if any"]
}`;

const BOT_GENERATION_PROMPT = `Convert this successful execution into a reusable automation bot.

The bot should:
1. Use COORDINATES for clicks (not selectors) since they're more reliable
2. Include human-like wait times between actions
3. Have clear step descriptions

Output JSON:
{
  "name": "descriptive name",
  "description": "what this bot does",
  "steps": [
    { 
      "action": "navigate|click|type|wait", 
      "coordinates": { "x": 0, "y": 0 },
      "text": "for type actions",
      "url": "for navigate",
      "wait_ms": 1000,
      "description": "human readable step description"
    }
  ],
  "target_platform": "platform name",
  "expected_result": "what should happen when bot succeeds"
}`;

// ============= OpenRouter API Call =============

async function callOpenRouter(
  supabase: any,
  taskType: string,
  messages: any[],
  sessionId: string | null = null
): Promise<{ content: string; usage: any } | null> {
  const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
  
  if (!OPENROUTER_API_KEY) {
    console.error('[agent-executor] OPENROUTER_API_KEY not set');
    return null;
  }

  // Получаем конфиг модели из БД или используем дефолт
  const config = await getModelConfig(supabase, taskType);
  const model = config?.model_name || MODELS[taskType as keyof typeof MODELS] || MODELS.execution;
  const maxTokens = config?.max_tokens || 1024;
  const temperature = config?.temperature || 0.3;
  const costPer1k = config?.cost_per_1k_tokens || 0.0001;

  // Для локальных моделей - другой endpoint
  if (config?.provider === 'local' || config?.provider === 'ollama') {
    if (config.custom_endpoint) {
      return callLocalModel(config.custom_endpoint, model, messages, maxTokens, temperature);
    }
    // Rule-based - без AI
    return { content: '', usage: { input: 0, output: 0 } };
  }

  const startTime = Date.now();

  try {
    const response = await fetch(OPENROUTER_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': Deno.env.get('SUPABASE_URL') || '',
        'X-Title': 'Session Automation Agent',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[agent-executor] OpenRouter error ${response.status}:`, errorText);
      
      // Пробуем fallback модель
      if (config?.fallback_model) {
        console.log(`[agent-executor] Trying fallback: ${config.fallback_model}`);
        const fallbackResponse = await fetch(OPENROUTER_API, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: config.fallback_model,
            messages,
            max_tokens: maxTokens,
            temperature,
          }),
        });
        
        if (fallbackResponse.ok) {
          const data = await fallbackResponse.json();
          const latency = Date.now() - startTime;
          await logAIUsage(supabase, sessionId, taskType, config.fallback_model, 'openrouter',
            data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0, costPer1k, latency);
          return { content: data.choices?.[0]?.message?.content || '', usage: data.usage };
        }
      }
      
      return null;
    }

    const data = await response.json();
    const latency = Date.now() - startTime;

    // Log usage
    await logAIUsage(supabase, sessionId, taskType, model, 'openrouter',
      data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0, costPer1k, latency);

    return { content: data.choices?.[0]?.message?.content || '', usage: data.usage };
  } catch (error) {
    console.error(`[agent-executor] OpenRouter call error:`, error);
    return null;
  }
}

async function callLocalModel(
  endpoint: string,
  model: string,
  messages: any[],
  maxTokens: number,
  temperature: number
): Promise<{ content: string; usage: any } | null> {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    return { content: data.choices?.[0]?.message?.content || '', usage: { input: 0, output: 0 } };
  } catch {
    return null;
  }
}

// ============= Rule-Based Verification (FREE) =============

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

  return { verified, confidence: results.length > 0 ? totalConfidence / results.length : 1, results };
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

    // ============= POST /decide =============
    if (req.method === 'POST' && path === '/decide') {
      const state = await req.json();

      const contextParts: string[] = [];
      contextParts.push(`GOAL: ${state.goal}`);
      if (state.current_url) contextParts.push(`URL: ${state.current_url}`);
      if (state.error) contextParts.push(`ERROR: ${state.error}`);
      if (state.attempt) contextParts.push(`ATTEMPT: ${state.attempt}`);
      if (state.previous_actions?.length) {
        contextParts.push(`RECENT: ${JSON.stringify(state.previous_actions.slice(-3))}`);
      }
      if (state.verification_results?.length) {
        const last = state.verification_results[state.verification_results.length - 1];
        contextParts.push(`LAST VERIFICATION: ${last.verified ? 'PASSED' : 'FAILED'}`);
      }

      const messages: any[] = [
        { role: 'system', content: AUTOMATION_SYSTEM_PROMPT },
        { role: 'user', content: contextParts.join('\n') }
      ];

      // Vision analysis (если есть скриншот)
      if (state.screenshot_base64) {
        const visionResult = await callOpenRouter(supabase, 'vision', [
          { role: 'system', content: VISION_ANALYSIS_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analyze:' },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${state.screenshot_base64}` } }
            ]
          }
        ], state.session_id);

        if (visionResult?.content) {
          messages[1].content += `\n\nVISION:\n${visionResult.content}`;
        }
      }

      // Main execution call
      const result = await callOpenRouter(supabase, 'execution', messages, state.session_id);

      if (!result) {
        return new Response(JSON.stringify({ error: 'AI call failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let agentResponse: any;
      try {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) agentResponse = JSON.parse(jsonMatch[0]);
        else throw new Error('No JSON');
      } catch {
        agentResponse = {
          action: { type: 'screenshot' },
          reasoning: 'Parse error',
          confidence: 0.3,
          goal_progress: 0,
          goal_achieved: false,
          requires_verification: false,
        };
      }

      // Log
      await supabase.from('session_logs').insert({
        session_id: state.session_id,
        level: 'info',
        message: `AI: ${agentResponse.action.type}`,
        action: agentResponse.action.type,
        details: { reasoning: agentResponse.reasoning, confidence: agentResponse.confidence },
      });

      await supabase.from('sessions').update({
        progress: agentResponse.goal_progress,
        metadata: { current_action: agentResponse.action.type, reasoning: agentResponse.reasoning },
      }).eq('id', state.session_id);

      if (agentResponse.goal_achieved || agentResponse.action.type === 'complete') {
        await supabase.from('sessions').update({
          status: 'success', progress: 100, completed_at: new Date().toISOString(),
        }).eq('id', state.session_id);
      }

      if (agentResponse.action.type === 'fail') {
        await supabase.from('sessions').update({
          status: 'error', error_message: agentResponse.action.reason, completed_at: new Date().toISOString(),
        }).eq('id', state.session_id);
      }

      return new Response(JSON.stringify(agentResponse), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ============= POST /verify (rule-based, FREE) =============
    if (req.method === 'POST' && path === '/verify') {
      const { session_id, action_index, action_type, verification_criteria, before_state, after_state, dom_changes, network_requests } = await req.json();

      const result = ruleBasedVerification(verification_criteria, before_state, after_state, dom_changes, network_requests);

      for (const r of result.results) {
        await supabase.from('action_verifications').insert({
          session_id, action_index, action_type, verification_type: r.type,
          verified: r.passed, confidence: r.confidence, evidence: r,
          before_state, after_state, verified_at: r.passed ? new Date().toISOString() : null,
        });
      }

      await supabase.from('session_logs').insert({
        session_id, level: result.verified ? 'success' : 'warning',
        message: `Verify: ${result.verified ? 'PASS' : 'FAIL'} (${(result.confidence * 100).toFixed(0)}%)`,
        action: 'verify', details: result,
      });

      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ============= POST /create-bot =============
    if (req.method === 'POST' && path === '/create-bot') {
      const { session_id, task_id, name, description } = await req.json();

      const { data: session } = await supabase.from('sessions').select('*, tasks(*)').eq('id', session_id).single();
      if (!session || session.status !== 'success') {
        return new Response(JSON.stringify({ error: 'Need successful session' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: logs } = await supabase.from('session_logs').select('*').eq('session_id', session_id).in('level', ['info', 'success']).order('timestamp', { ascending: true });
      const executionHistory = logs?.map(l => ({ action: l.action, details: l.details })) || [];

      const result = await callOpenRouter(supabase, 'bot_generation', [
        { role: 'system', content: BOT_GENERATION_PROMPT },
        { role: 'user', content: `Goal: ${(session.metadata as any)?.goal}\nPlatform: ${session.tasks?.target_platform}\nHistory: ${JSON.stringify(executionHistory)}` }
      ], session_id);

      if (!result) {
        return new Response(JSON.stringify({ error: 'Bot generation failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      let botConfig: any;
      try {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) botConfig = JSON.parse(jsonMatch[0]);
        else throw new Error('No JSON');
      } catch {
        return new Response(JSON.stringify({ error: 'Parse failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: bot, error: botError } = await supabase.from('automation_bots').insert({
        name: name || botConfig.name, description: description || botConfig.description,
        created_by_task_id: task_id, scenario_json: botConfig.steps,
        target_platform: botConfig.target_platform || session.tasks?.target_platform,
      }).select().single();

      if (botError) {
        return new Response(JSON.stringify({ error: 'Save failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ success: true, bot_id: bot.id, bot }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ============= POST /execute-bot =============
    if (req.method === 'POST' && path === '/execute-bot') {
      const { bot_id, profile_id, count = 1 } = await req.json();

      const { data: bot } = await supabase.from('automation_bots').select('*').eq('id', bot_id).single();
      if (!bot) {
        return new Response(JSON.stringify({ error: 'Bot not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const sessions = [];
      for (let i = 0; i < count; i++) {
        const { data: session } = await supabase.from('sessions').insert({
          profile_id, automation_bot_id: bot_id, status: 'queued',
          metadata: { bot_execution: true, bot_name: bot.name, index: i }
        }).select().single();

        if (session) {
          await supabase.from('execution_queue').insert({ session_id: session.id, priority: 0 });
          sessions.push(session);
        }
      }

      await supabase.from('automation_bots').update({ execution_count: (bot.execution_count || 0) + count }).eq('id', bot_id);

      return new Response(JSON.stringify({ success: true, sessions_created: sessions.length, session_ids: sessions.map(s => s.id) }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ============= GET /bots =============
    if (req.method === 'GET' && path === '/bots') {
      const { data: bots } = await supabase.from('automation_bots').select('*').eq('is_active', true).order('created_at', { ascending: false });
      return new Response(JSON.stringify({ bots }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ============= GET /cost-stats =============
    if (req.method === 'GET' && path === '/cost-stats') {
      const { data: stats } = await supabase.from('ai_usage_log').select('task_type, model_used, cost_usd').gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      const summary: Record<string, number> = {};
      let totalCost = 0;
      for (const s of stats || []) {
        summary[s.task_type] = (summary[s.task_type] || 0) + Number(s.cost_usd);
        totalCost += Number(s.cost_usd);
      }
      return new Response(JSON.stringify({ total_cost_24h: totalCost, by_task_type: summary }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ============= POST /start =============
    if (req.method === 'POST' && path === '/start') {
      const { task_id, session_id } = await req.json();

      const { data: task } = await supabase.from('tasks').select('*').eq('id', task_id).single();
      if (!task) {
        return new Response(JSON.stringify({ error: 'Task not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
        const urls: Record<string, string> = { youtube: 'https://www.youtube.com', spotify: 'https://open.spotify.com', twitter: 'https://twitter.com', telegram: 'https://web.telegram.org', generic: 'https://www.google.com' };
        startUrl = urls[task.target_platform.toLowerCase()] || 'https://www.google.com';
      }

      await supabase.from('sessions').update({ status: 'running', started_at: new Date().toISOString(), current_url: startUrl, metadata: { autonomous_mode: true, goal, task_id } }).eq('id', session_id);
      await supabase.from('session_logs').insert({ session_id, level: 'info', message: `Start: ${goal}`, action: 'start', details: { goal, start_url: startUrl } });

      return new Response(JSON.stringify({ goal, start_url: startUrl, initial_action: { type: 'navigate', url: startUrl } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ============= POST /report =============
    if (req.method === 'POST' && path === '/report') {
      const { session_id, action_result, screenshot_base64, current_url, error, verification_data } = await req.json();

      const { data: session } = await supabase.from('sessions').select('*, tasks(*)').eq('id', session_id).single();
      if (!session) {
        return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: logs } = await supabase.from('session_logs').select('action, details').eq('session_id', session_id).order('timestamp', { ascending: false }).limit(5);
      const previousActions = logs?.filter(l => l.details?.action).map(l => l.details?.action).reverse() || [];
      const goal = (session.metadata as any)?.goal || 'Unknown';

      await supabase.from('session_logs').insert({ session_id, level: error ? 'warning' : 'info', message: `Report: ${action_result || 'done'}${error ? ` (${error})` : ''}`, action: 'report', details: { action_result, current_url, verification: verification_data } });

      const decideResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/agent-executor/decide`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-runner-id': runnerId },
        body: JSON.stringify({ session_id, task_id: session.task_id || '', goal, current_url: current_url || session.current_url, screenshot_base64, previous_actions: previousActions, error, attempt: previousActions.length + 1, verification_results: verification_data?.results })
      });

      const nextAction = await decideResponse.json();
      return new Response(JSON.stringify(nextAction), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[agent-executor] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
