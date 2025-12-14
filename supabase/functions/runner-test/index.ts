import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions';

// Helper to get runner URL from database
async function getRunnerUrl(): Promise<string> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  
  const { data } = await supabase
    .from('railway_config')
    .select('runner_url')
    .eq('id', 'default')
    .single();
  
  const runnerUrl = data?.runner_url || Deno.env.get('RUNNER_API_URL') || 'http://localhost:3001';
  return runnerUrl.replace(/\/$/, ''); // Remove trailing slash
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace('/runner-test', '');
  
  // Get runner URL from database
  const RUNNER_API_URL = await getRunnerUrl();
  console.log(`[runner-test] Using RUNNER_API_URL: ${RUNNER_API_URL}`);
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

    // POST /test-typing - Test human-like typing on Google search
    if (req.method === 'POST' && path === '/test-typing') {
      const { text, speed } = await req.json();
      const testText = text || 'Hello world test';
      const typingSpeed = speed || 'normal';
      
      console.log(`[runner-test] Testing human-like typing: "${testText}" with speed=${typingSpeed}`);
      
      const results: any[] = [];
      
      // Step 1: Navigate to Google
      const navResult = await fetch(`${RUNNER_API_URL}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'navigate', url: 'https://www.google.com' }),
      }).then(r => r.json());
      
      results.push({ step: 'navigate', success: navResult.success, url: navResult.currentUrl });
      
      if (!navResult.success) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Navigation failed',
          results 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Wait for page to load
      await new Promise(r => setTimeout(r, 1000));
      
      // Step 2: Type into search box with human-like behavior
      const startTime = Date.now();
      
      const typeResult = await fetch(`${RUNNER_API_URL}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'type', 
          text: testText,
          selector: 'textarea[name="q"], input[name="q"]', // Google search input
          speed: typingSpeed,
          clear_first: true,
          press_enter: false // Don't submit yet
        }),
      }).then(r => r.json());
      
      const typingDuration = Date.now() - startTime;
      
      results.push({ 
        step: 'type', 
        success: typeResult.success, 
        data: typeResult.data,
        typing_duration_ms: typingDuration
      });
      
      // Step 3: Take final screenshot
      const screenshotResult = await fetch(`${RUNNER_API_URL}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'screenshot' }),
      }).then(r => r.json());
      
      // Calculate typing metrics
      const charsPerSecond = testText.length / (typingDuration / 1000);
      const avgDelayMs = typingDuration / testText.length;
      
      // Human typing speed reference:
      // Slow: ~30-40 WPM = ~2.5-3.3 chars/sec
      // Normal: ~40-60 WPM = ~3.3-5 chars/sec  
      // Fast: ~60-80 WPM = ~5-6.7 chars/sec
      // Very fast: 80+ WPM = 6.7+ chars/sec
      
      let humanLikeAssessment = 'too_fast';
      if (charsPerSecond < 3) humanLikeAssessment = 'slow_human';
      else if (charsPerSecond < 5) humanLikeAssessment = 'normal_human';
      else if (charsPerSecond < 7) humanLikeAssessment = 'fast_human';
      else if (charsPerSecond < 10) humanLikeAssessment = 'very_fast_human';
      else humanLikeAssessment = 'suspicious_speed';
      
      return new Response(JSON.stringify({
        success: typeResult.success,
        text_typed: testText,
        speed_setting: typingSpeed,
        typing_metrics: {
          duration_ms: typingDuration,
          chars_per_second: charsPerSecond.toFixed(2),
          avg_delay_per_char_ms: avgDelayMs.toFixed(1),
          human_like_assessment: humanLikeAssessment,
        },
        results,
        screenshot: screenshotResult.screenshot,
        current_url: screenshotResult.currentUrl
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

    // POST /test-human - Test human-like behavior (mouse, scroll, drag, etc.)
    if (req.method === 'POST' && path === '/test-human') {
      const { test_type } = await req.json();
      const testType = test_type || 'full';
      
      console.log(`[runner-test] Testing human-like behavior: ${testType}`);
      
      const results: any = { test_type: testType, actions: [] };
      
      // Navigate to test page first
      await fetch(`${RUNNER_API_URL}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'navigate', url: 'https://www.google.com' })
      });
      
      await new Promise(r => setTimeout(r, 500));
      
      switch (testType) {
        case 'mouse': {
          // Test mouse movement with micro-jitter
          let start = Date.now();
          let result = await fetch(`${RUNNER_API_URL}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'mousemove', coordinates: { x: 500, y: 300 } })
          }).then(r => r.json());
          
          results.actions.push({
            action: 'mousemove',
            duration_ms: Date.now() - start,
            success: result.success,
            description: 'Mouse moved with Bezier curve + micro-jitter'
          });
          
          // Test area click
          start = Date.now();
          result = await fetch(`${RUNNER_API_URL}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'click', coordinates: { x: 500, y: 300 }, click_area_radius: 10 })
          }).then(r => r.json());
          
          results.actions.push({
            action: 'click (10px area)',
            duration_ms: Date.now() - start,
            success: result.success,
            description: 'Click random point within 10px radius'
          });
          
          results.screenshot = result.screenshot;
          break;
        }
        
        case 'scroll': {
          // Scroll down with natural easing
          let start = Date.now();
          let result = await fetch(`${RUNNER_API_URL}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'scroll', coordinates: { y: 600 } })
          }).then(r => r.json());
          
          results.actions.push({
            action: 'scroll down 600px',
            duration_ms: Date.now() - start,
            success: result.success,
            description: 'Smooth scroll with ease-in-out'
          });
          
          await new Promise(r => setTimeout(r, 300));
          
          // Scroll up
          start = Date.now();
          result = await fetch(`${RUNNER_API_URL}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'scroll', coordinates: { y: -400 } })
          }).then(r => r.json());
          
          results.actions.push({
            action: 'scroll up 400px',
            duration_ms: Date.now() - start,
            success: result.success,
            description: 'Natural deceleration scroll'
          });
          
          results.screenshot = result.screenshot;
          break;
        }
        
        case 'drag': {
          const start = Date.now();
          const result = await fetch(`${RUNNER_API_URL}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              action: 'drag', 
              coordinates: { x: 200, y: 200 },
              toCoordinates: { x: 600, y: 400 },
              click_area_radius: 8
            })
          }).then(r => r.json());
          
          results.actions.push({
            action: 'drag',
            duration_ms: Date.now() - start,
            success: result.success,
            description: 'Drag from (200,200) to (600,400) with area variance'
          });
          
          results.screenshot = result.screenshot;
          break;
        }
        
        case 'idle': {
          const start = Date.now();
          const result = await fetch(`${RUNNER_API_URL}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'idle', duration: 3000 })
          }).then(r => r.json());
          
          results.actions.push({
            action: 'idle micro-movements',
            duration_ms: Date.now() - start,
            success: result.success,
            description: 'Idle mouse jitter for 3 seconds'
          });
          
          results.screenshot = result.screenshot;
          break;
        }
        
        case 'full':
        default: {
          // Full interaction sequence
          const sequence = [
            { action: 'mousemove', coordinates: { x: 400, y: 200 }, desc: 'Move to (400,200)' },
            { action: 'click', coordinates: { x: 960, y: 400 }, click_area_radius: 8, desc: 'Click center-ish' },
            { action: 'scroll', coordinates: { y: 400 }, desc: 'Scroll down' },
            { action: 'mousemove', coordinates: { x: 800, y: 500 }, desc: 'Move to (800,500)' },
            { action: 'scroll', coordinates: { y: -200 }, desc: 'Scroll up' },
            { action: 'click', selector: 'textarea[name="q"], input[name="q"]', click_area_radius: 5, desc: 'Click search' },
          ];
          
          for (const cmd of sequence) {
            const start = Date.now();
            const result = await fetch(`${RUNNER_API_URL}/execute`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(cmd)
            }).then(r => r.json());
            
            results.actions.push({
              action: cmd.desc || cmd.action,
              duration_ms: Date.now() - start,
              success: result.success
            });
            
            results.screenshot = result.screenshot;
            await new Promise(r => setTimeout(r, 100));
          }
          break;
        }
      }
      
      // Calculate stats
      const totalDuration = results.actions.reduce((sum: number, a: any) => sum + (a.duration_ms || 0), 0);
      const successRate = results.actions.filter((a: any) => a.success).length / results.actions.length * 100;
      
      results.stats = {
        total_duration_ms: totalDuration,
        success_rate: `${successRate.toFixed(0)}%`,
        actions_count: results.actions.length
      };
      
      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /test-antibot - Test against bot detection services
    if (req.method === 'POST' && path === '/test-antibot') {
      const { sites } = await req.json();
      
      // List of bot detection test sites
      const testSites = sites || [
        { name: 'SannySoft', url: 'https://bot.sannysoft.com/' },
        { name: 'Incolumitas', url: 'https://bot.incolumitas.com/' },
        { name: 'BrowserLeaks Canvas', url: 'https://browserleaks.com/canvas' },
        { name: 'PixelScan', url: 'https://pixelscan.net/' },
        { name: 'CreepJS', url: 'https://abrahamjuliot.github.io/creepjs/' },
      ];
      
      console.log(`[runner-test] Testing against ${testSites.length} antibot sites`);
      
      const results: any[] = [];
      
      for (const site of testSites) {
        console.log(`[runner-test] Testing: ${site.name}`);
        
        try {
          // Navigate to site
          const navStart = Date.now();
          const navResult = await fetch(`${RUNNER_API_URL}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              action: 'navigate', 
              url: site.url,
              timeout: 30000 
            })
          }).then(r => r.json());
          
          if (!navResult.success) {
            results.push({
              site: site.name,
              url: site.url,
              success: false,
              error: navResult.error || 'Navigation failed'
            });
            continue;
          }
          
          // Wait for page to fully load and run detection tests
          await new Promise(r => setTimeout(r, 3000));
          
          // Perform some human-like actions
          await fetch(`${RUNNER_API_URL}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'scroll', coordinates: { y: 300 } })
          });
          
          await new Promise(r => setTimeout(r, 1000));
          
          await fetch(`${RUNNER_API_URL}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'mousemove', coordinates: { x: 600, y: 400 } })
          });
          
          await new Promise(r => setTimeout(r, 500));
          
          // Take screenshot
          const screenshotResult = await fetch(`${RUNNER_API_URL}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'screenshot' })
          }).then(r => r.json());
          
          // Try to extract detection results via page evaluation
          let detectionResults: any = null;
          try {
            const evalResult = await fetch(`${RUNNER_API_URL}/execute`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                action: 'evaluate',
                script: `
                  (function() {
                    const results = {};
                    
                    // Try to get navigator.webdriver status
                    results.webdriver = navigator.webdriver;
                    
                    // Check for automation indicators
                    results.automationControlled = !!window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
                    results.hasChrome = !!window.chrome;
                    results.hasPlugins = navigator.plugins.length > 0;
                    results.languagesCount = navigator.languages?.length || 0;
                    
                    // Check for SannySoft specific results
                    const failedTests = document.querySelectorAll('td.failed');
                    if (failedTests.length > 0) {
                      results.failedTests = Array.from(failedTests).map(td => 
                        td.previousElementSibling?.textContent?.trim() || 'unknown'
                      );
                    }
                    
                    // Check for CreepJS score
                    const creepScore = document.querySelector('.fingerprint-header .grade');
                    if (creepScore) {
                      results.creepjsGrade = creepScore.textContent?.trim();
                    }
                    
                    return results;
                  })()
                `
              })
            }).then(r => r.json());
            
            if (evalResult.success) {
              detectionResults = evalResult.data;
            }
          } catch (e) {
            console.log(`[runner-test] Could not extract detection data from ${site.name}`);
          }
          
          results.push({
            site: site.name,
            url: site.url,
            success: true,
            load_time_ms: Date.now() - navStart,
            detection_data: detectionResults,
            screenshot: screenshotResult.screenshot
          });
          
        } catch (error) {
          results.push({
            site: site.name,
            url: site.url,
            success: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      
      // Summary
      const passed = results.filter(r => r.success && !r.detection_data?.webdriver).length;
      const failed = results.filter(r => !r.success || r.detection_data?.webdriver).length;
      
      return new Response(JSON.stringify({
        summary: {
          total: results.length,
          passed,
          failed,
          verdict: failed === 0 ? 'STEALTH_OK' : passed > failed ? 'MOSTLY_OK' : 'DETECTED'
        },
        results: results.map(r => ({
          ...r,
          screenshot: r.screenshot ? `${r.screenshot.substring(0, 50)}...` : null
        })),
        screenshots: Object.fromEntries(
          results.filter(r => r.screenshot).map(r => [r.site, r.screenshot])
        )
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /warmup - Perform browser warmup
    if (req.method === 'POST' && path === '/warmup') {
      const { sites } = await req.json().catch(() => ({}));
      
      console.log(`[runner-test] Starting browser warmup...`);
      
      const result = await fetch(`${RUNNER_API_URL}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'warmup',
          sites: sites || undefined
        })
      }).then(r => r.json());
      
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /add-cookies - Add cookies for a domain
    if (req.method === 'POST' && path === '/add-cookies') {
      const { domain } = await req.json();
      
      if (!domain) {
        return new Response(JSON.stringify({ error: 'Domain required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      console.log(`[runner-test] Adding cookies for domain: ${domain}`);
      
      const result = await fetch(`${RUNNER_API_URL}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add-cookies', domain })
      }).then(r => r.json());
      
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /cookies - Get all browser cookies
    if (req.method === 'GET' && path === '/cookies') {
      const result = await fetch(`${RUNNER_API_URL}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get-cookies' })
      }).then(r => r.json());
      
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /test-autonomous - Run autonomous AI-driven task
    // AI agent understands simple commands like "зарегистрируйся" and figures out everything itself
    if (req.method === 'POST' && path === '/test-autonomous') {
      const { url, goal, max_actions = 50 } = await req.json();
      
      if (!url || !goal) {
        return new Response(JSON.stringify({ 
          error: 'url and goal are required',
          example: { 
            url: 'https://justfans.uno', 
            goal: 'зарегистрируйся'  // Simple command - AI figures out the rest!
          },
          supported_commands: [
            'зарегистрируйся',
            'залогинься',
            'подпишись на канал',
            'поставь лайк',
            'оставь комментарий'
          ]
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
      if (!OPENROUTER_API_KEY) {
        return new Response(JSON.stringify({ error: 'OPENROUTER_API_KEY not configured' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`[runner-test] Autonomous execution: "${goal}" on ${url}`);
      
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      const sessionId = crypto.randomUUID();
      const executionLog: any[] = [];
      let actionsExecuted = 0;
      let goalAchieved = false;
      let lastScreenshot = '';
      let currentUrl = url;
      
      let generatedData: any = null; // AI-generated credentials/data
      
      const logStep = (type: string, data: any) => {
        executionLog.push({ step: actionsExecuted, type, time: new Date().toISOString(), ...data });
        console.log(`[autonomous #${actionsExecuted}] ${type}:`, JSON.stringify(data).slice(0, 150));
      };

      console.log(`[autonomous] Simple goal: "${goal}" - AI will figure out the details`);

      try {
        // Step 1: Navigate to target
        logStep('navigate', { url });
        const navResult = await fetch(`${RUNNER_API_URL}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'navigate', url })
        }).then(r => r.json());
        
        if (!navResult.success) {
          throw new Error(`Navigation failed: ${navResult.error}`);
        }
        
        currentUrl = navResult.currentUrl || url;
        lastScreenshot = navResult.screenshot || '';
        
        await new Promise(r => setTimeout(r, 2000));
        
        // Main autonomous loop - uses agent-executor/decide for AI decisions
        while (actionsExecuted < max_actions && !goalAchieved) {
          actionsExecuted++;
          
          // Get current screenshot
          const ssResult = await fetch(`${RUNNER_API_URL}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'screenshot' })
          }).then(r => r.json());
          
          if (!ssResult.success || !ssResult.screenshot) {
            logStep('error', { message: 'Screenshot failed' });
            break;
          }
          
          lastScreenshot = ssResult.screenshot;
          currentUrl = ssResult.currentUrl || currentUrl;
          
          // Call agent-executor/decide - the AI brain that analyzes screenshot and decides next action
          const agentUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/agent-executor/decide`;
          const decideResponse = await fetch(agentUrl, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
            },
            body: JSON.stringify({
              session_id: sessionId,
              goal,
              current_url: currentUrl,
              screenshot_base64: lastScreenshot,
              previous_actions: executionLog.slice(-5).map(l => l.type),
              attempt: actionsExecuted
            })
          });
          
          if (!decideResponse.ok) {
            const err = await decideResponse.text();
            logStep('ai_error', { status: decideResponse.status, error: err });
            break;
          }
          
          const decision = await decideResponse.json();
          
          // Track AI-generated data (credentials, etc.)
          if (decision.generated_data) {
            generatedData = { ...generatedData, ...decision.generated_data };
          }
          
          logStep('ai_decision', { 
            action: decision.action?.type,
            coordinates: decision.action?.coordinates,
            text: decision.action?.text?.slice(0, 30),
            confidence: decision.confidence,
            progress: decision.goal_progress,
            reasoning: decision.reasoning?.slice(0, 80),
            generated_data: decision.generated_data ? Object.keys(decision.generated_data) : null
          });
          
          // Check terminal states
          if (decision.action?.type === 'complete') {
            goalAchieved = true;
            // Capture final generated data from complete action
            if (decision.action.generated_data) {
              generatedData = { ...generatedData, ...decision.action.generated_data };
            }
            logStep('goal_achieved', { 
              reason: decision.action.reason,
              generated_data: generatedData
            });
            break;
          }
          
          if (decision.action?.type === 'fail') {
            logStep('goal_failed', { reason: decision.action.reason });
            break;
          }
          
          // Build action payload for runner HTTP API
          // The runner uses humanClick/humanType etc. automatically
          let actionPayload: any = { action: decision.action?.type };
          
          switch (decision.action?.type) {
            case 'navigate':
              actionPayload.url = decision.action.url;
              break;
              
            case 'click':
              // AI provides coordinates from screenshot analysis
              if (decision.action.coordinates) {
                actionPayload.coordinates = decision.action.coordinates;
                actionPayload.click_area_radius = 5; // Human-like variance
              } else if (decision.action.selector) {
                actionPayload.selector = decision.action.selector;
              }
              break;
              
            case 'type':
              actionPayload.text = decision.action.text;
              if (decision.action.selector) {
                actionPayload.selector = decision.action.selector;
              }
              actionPayload.speed = 'normal'; // Human-like typing speed
              break;
              
            case 'scroll':
              actionPayload.action = 'scroll';
              actionPayload.coordinates = { 
                y: (decision.action.direction === 'up' ? -1 : 1) * (decision.action.amount || 300) 
              };
              break;
              
            case 'wait':
              await new Promise(r => setTimeout(r, decision.action.amount || 1000));
              continue;
              
            case 'screenshot':
              continue;
              
            default:
              logStep('unknown_action', { type: decision.action?.type });
              continue;
          }
          
          // Execute via runner HTTP API - uses human-like behavior internally
          const execResult = await fetch(`${RUNNER_API_URL}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(actionPayload)
          }).then(r => r.json());
          
          logStep('execute', { 
            action: actionPayload.action, 
            success: execResult.success,
            coordinates: actionPayload.coordinates,
            error: execResult.error
          });
          
          // Brief pause between actions (human-like)
          await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
        }
        
        // Final screenshot
        const finalSS = await fetch(`${RUNNER_API_URL}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'screenshot' })
        }).then(r => r.json());
        
        return new Response(JSON.stringify({
          success: goalAchieved,
          session_id: sessionId,
          goal,
          start_url: url,
          final_url: finalSS.currentUrl || currentUrl,
          actions_executed: actionsExecuted,
          max_actions,
          // AI-generated data (credentials, etc.)
          generated_data: generatedData,
          execution_log: executionLog,
          final_screenshot: finalSS.screenshot,
          summary: goalAchieved 
            ? `Goal achieved in ${actionsExecuted} actions` 
            : `Stopped after ${actionsExecuted}/${max_actions} actions`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
        
      } catch (error) {
        logStep('fatal_error', { message: error instanceof Error ? error.message : String(error) });
        return new Response(JSON.stringify({ 
          error: error instanceof Error ? error.message : String(error),
          session_id: sessionId,
          actions_executed: actionsExecuted,
          generated_data: generatedData,
          execution_log: executionLog,
          final_screenshot: lastScreenshot
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
