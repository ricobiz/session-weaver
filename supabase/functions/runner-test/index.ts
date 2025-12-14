import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Runner HTTP API endpoint (set this to your runner's address)
const rawRunnerUrl = Deno.env.get('RUNNER_API_URL') || 'http://localhost:3001';
const RUNNER_API_URL = rawRunnerUrl.replace(/\/$/, ''); // Remove trailing slash
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
