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
