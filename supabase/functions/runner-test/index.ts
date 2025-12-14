import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Runner HTTP API endpoint (set this to your runner's address)
const rawRunnerUrl = Deno.env.get('RUNNER_API_URL') || 'http://localhost:3001';
const RUNNER_API_URL = rawRunnerUrl.replace(/\/$/, ''); // Remove trailing slash
const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions';

console.log('[runner-test] Using RUNNER_API_URL:', RUNNER_API_URL);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace('/runner-test', '');

  console.log(`[runner-test] ${req.method} ${path}`);

  try {
    // GET /health - Check runner status
    if (req.method === 'GET' && path === '/health') {
      const response = await fetch(`${RUNNER_API_URL}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        return new Response(JSON.stringify({ 
          error: 'Runner not responding',
          status: response.status 
        }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const data = await response.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /logs - Get runner logs
    if (req.method === 'GET' && path === '/logs') {
      const response = await fetch(`${RUNNER_API_URL}/logs`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      const data = await response.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /execute - Execute action on runner
    if (req.method === 'POST' && path === '/execute') {
      const body = await req.json();
      console.log(`[runner-test] Execute action: ${body.action}`);

      const response = await fetch(`${RUNNER_API_URL}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      
      // Log result
      console.log(`[runner-test] Result: success=${data.success}, url=${data.currentUrl || 'n/a'}`);
      if (data.error) {
        console.log(`[runner-test] Error: ${data.error}`);
      }

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /close - Close browser
    if (req.method === 'POST' && path === '/close') {
      const response = await fetch(`${RUNNER_API_URL}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /test-scenario - Run a quick test scenario
    if (req.method === 'POST' && path === '/test-scenario') {
      const { url: targetUrl, actions } = await req.json();
      const results: any[] = [];

      // Navigate first
      if (targetUrl) {
        const navResult = await fetch(`${RUNNER_API_URL}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'navigate', url: targetUrl }),
        }).then(r => r.json());
        
        results.push({ step: 'navigate', ...navResult });
        
        if (!navResult.success) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Navigation failed',
            results 
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // Execute additional actions
      if (actions && Array.isArray(actions)) {
        for (const action of actions) {
          const actionResult = await fetch(`${RUNNER_API_URL}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(action),
          }).then(r => r.json());
          
          results.push({ step: action.action, ...actionResult });
          
          if (!actionResult.success) {
            break;
          }
        }
      }

      const finalScreenshot = results[results.length - 1]?.screenshot;
      
      return new Response(JSON.stringify({ 
        success: results.every(r => r.success),
        stepsCompleted: results.filter(r => r.success).length,
        totalSteps: results.length,
        finalScreenshot,
        results: results.map(r => ({ 
          step: r.step, 
          success: r.success, 
          error: r.error,
          currentUrl: r.currentUrl,
          logs: r.logs 
        })),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /test-vision - Test vision model with a screenshot
    if (req.method === 'POST' && path === '/test-vision') {
      const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
      if (!OPENROUTER_API_KEY) {
        return new Response(JSON.stringify({ error: 'OPENROUTER_API_KEY not set' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      // Get vision model from config
      const { data: modelConfig } = await supabase
        .from('model_config')
        .select('*')
        .eq('task_type', 'vision')
        .eq('is_active', true)
        .single();

      const visionModel = modelConfig?.model_name || 'google/gemini-2.5-flash-lite';
      console.log(`[runner-test] Using vision model: ${visionModel}`);

      // First, get a screenshot from the runner
      const screenshotResponse = await fetch(`${RUNNER_API_URL}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'screenshot' }),
      });

      const screenshotData = await screenshotResponse.json();
      
      if (!screenshotData.success || !screenshotData.screenshot) {
        return new Response(JSON.stringify({ 
          error: 'Failed to get screenshot from runner',
          details: screenshotData
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`[runner-test] Got screenshot, sending to vision model...`);

      // Send to OpenRouter vision model
      const startTime = Date.now();
      const visionResponse = await fetch(OPENROUTER_API, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': Deno.env.get('SUPABASE_URL') || '',
          'X-Title': 'Vision Test',
        },
        body: JSON.stringify({
          model: visionModel,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Analyze this screenshot. Describe what you see on the page: the main elements, any text visible, buttons, forms, etc. Keep it brief.' },
                { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshotData.screenshot}` } }
              ]
            }
          ],
          max_tokens: 500,
          temperature: 0.2,
        }),
      });

      const latencyMs = Date.now() - startTime;

      if (!visionResponse.ok) {
        const errorText = await visionResponse.text();
        console.error(`[runner-test] Vision API error: ${visionResponse.status}`, errorText);
        return new Response(JSON.stringify({ 
          error: 'Vision model failed',
          status: visionResponse.status,
          details: errorText,
          model: visionModel
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const visionResult = await visionResponse.json();
      const analysis = visionResult.choices?.[0]?.message?.content || 'No response';

      console.log(`[runner-test] Vision analysis complete in ${latencyMs}ms`);

      return new Response(JSON.stringify({
        success: true,
        model: visionModel,
        latency_ms: latencyMs,
        analysis,
        usage: visionResult.usage,
        screenshot_preview: screenshotData.screenshot.substring(0, 100) + '...',
        current_url: screenshotData.currentUrl
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[runner-test] Error: ${errorMessage}`);
    
    return new Response(JSON.stringify({ 
      error: errorMessage,
      hint: 'Is the runner running and accessible?'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
