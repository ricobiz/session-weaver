import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { log, createSessionLogger } from './logger';
import { applyStealthPatches } from './stealth';
import { generateFingerprint, getRandomPreset } from './stealth/fingerprint';

interface ExecuteRequest {
  action: 'screenshot' | 'navigate' | 'click' | 'type' | 'scroll' | 'evaluate';
  url?: string;
  selector?: string;
  text?: string;
  coordinates?: { x: number; y: number };
  script?: string;
  timeout?: number;
}

interface ExecuteResponse {
  success: boolean;
  data?: any;
  screenshot?: string;
  currentUrl?: string;
  error?: string;
  logs: string[];
}

// Persistent browser instance for testing
let testBrowser: Browser | null = null;
let testContext: BrowserContext | null = null;
let testPage: Page | null = null;
const sessionLogs: string[] = [];

function addLog(message: string) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}`;
  sessionLogs.push(logEntry);
  if (sessionLogs.length > 100) sessionLogs.shift();
  log('info', message);
}

async function ensureBrowser(): Promise<Page> {
  if (!testBrowser || !testBrowser.isConnected()) {
    addLog('Launching browser...');
    
    testBrowser = await chromium.launch({
      headless: process.env.HEADLESS !== 'false',
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
      ignoreDefaultArgs: ['--enable-automation'],
    });
    
    const fingerprint = generateFingerprint(getRandomPreset());
    
    testContext = await testBrowser.newContext({
      bypassCSP: true,
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York',
    });
    
    await applyStealthPatches(testContext, fingerprint);
    testPage = await testContext.newPage();
    
    addLog('Browser ready');
  }
  
  if (!testPage || testPage.isClosed()) {
    testPage = await testContext!.newPage();
  }
  
  return testPage;
}

async function executeAction(req: ExecuteRequest): Promise<ExecuteResponse> {
  const logs: string[] = [];
  const logAction = (msg: string) => {
    logs.push(msg);
    addLog(msg);
  };

  try {
    const page = await ensureBrowser();
    const timeout = req.timeout || 30000;

    switch (req.action) {
      case 'navigate': {
        if (!req.url) throw new Error('URL required for navigate');
        logAction(`Navigating to: ${req.url}`);
        await page.goto(req.url, { waitUntil: 'domcontentloaded', timeout });
        logAction(`Navigation complete: ${page.url()}`);
        
        const screenshot = await page.screenshot({ type: 'png' });
        return {
          success: true,
          currentUrl: page.url(),
          screenshot: screenshot.toString('base64'),
          logs,
        };
      }

      case 'screenshot': {
        logAction(`Taking screenshot of: ${page.url()}`);
        const screenshot = await page.screenshot({ type: 'png', fullPage: false });
        return {
          success: true,
          currentUrl: page.url(),
          screenshot: screenshot.toString('base64'),
          logs,
        };
      }

      case 'click': {
        if (req.coordinates) {
          logAction(`Clicking at coordinates: (${req.coordinates.x}, ${req.coordinates.y})`);
          await page.mouse.click(req.coordinates.x, req.coordinates.y);
        } else if (req.selector) {
          logAction(`Clicking selector: ${req.selector}`);
          await page.click(req.selector, { timeout });
        } else {
          throw new Error('Selector or coordinates required for click');
        }
        
        await page.waitForTimeout(500);
        const screenshot = await page.screenshot({ type: 'png' });
        return {
          success: true,
          currentUrl: page.url(),
          screenshot: screenshot.toString('base64'),
          logs,
        };
      }

      case 'type': {
        if (!req.text) throw new Error('Text required for type');
        logAction(`Typing: "${req.text.slice(0, 50)}${req.text.length > 50 ? '...' : ''}"`);
        
        if (req.selector) {
          await page.click(req.selector, { timeout });
        }
        await page.keyboard.type(req.text, { delay: 50 });
        
        const screenshot = await page.screenshot({ type: 'png' });
        return {
          success: true,
          currentUrl: page.url(),
          screenshot: screenshot.toString('base64'),
          logs,
        };
      }

      case 'scroll': {
        const amount = req.coordinates?.y || 500;
        logAction(`Scrolling: ${amount}px`);
        await page.mouse.wheel(0, amount);
        await page.waitForTimeout(300);
        
        const screenshot = await page.screenshot({ type: 'png' });
        return {
          success: true,
          currentUrl: page.url(),
          screenshot: screenshot.toString('base64'),
          logs,
        };
      }

      case 'evaluate': {
        if (!req.script) throw new Error('Script required for evaluate');
        logAction(`Evaluating script...`);
        const result = await page.evaluate(req.script);
        return {
          success: true,
          data: result,
          currentUrl: page.url(),
          logs,
        };
      }

      default:
        throw new Error(`Unknown action: ${req.action}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logAction(`Error: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage,
      logs,
    };
  }
}

async function closeBrowser(): Promise<void> {
  if (testPage) {
    await testPage.close().catch(() => {});
    testPage = null;
  }
  if (testContext) {
    await testContext.close().catch(() => {});
    testContext = null;
  }
  if (testBrowser) {
    await testBrowser.close().catch(() => {});
    testBrowser = null;
  }
  addLog('Browser closed');
}

// HTTP Server
export function startHttpApi(port: number = 3001): void {
  const server = Bun?.serve?.({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      // CORS headers
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      };

      if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
      }

      try {
        // GET /health - Health check
        if (path === '/health' && req.method === 'GET') {
          return new Response(JSON.stringify({
            status: 'ok',
            browserActive: testBrowser?.isConnected() || false,
            currentUrl: testPage ? await testPage.url().catch(() => null) : null,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // GET /logs - Get recent logs
        if (path === '/logs' && req.method === 'GET') {
          return new Response(JSON.stringify({ logs: sessionLogs }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // POST /execute - Execute an action
        if (path === '/execute' && req.method === 'POST') {
          const body = await req.json() as ExecuteRequest;
          const result = await executeAction(body);
          return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // POST /close - Close browser
        if (path === '/close' && req.method === 'POST') {
          await closeBrowser();
          return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 404
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return new Response(JSON.stringify({ error: errorMessage }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    },
  });

  if (server) {
    log('info', `HTTP API listening on port ${port}`);
  } else {
    // Fallback for Node.js (non-Bun environment)
    startNodeHttpApi(port);
  }
}

// Node.js fallback using native http
function startNodeHttpApi(port: number): void {
  import('http').then(({ createServer }) => {
    const server = createServer(async (req, res) => {
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json',
      };

      if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeaders);
        res.end();
        return;
      }

      const url = new URL(req.url || '/', `http://localhost:${port}`);
      const path = url.pathname;

      try {
        if (path === '/health' && req.method === 'GET') {
          res.writeHead(200, corsHeaders);
          res.end(JSON.stringify({
            status: 'ok',
            browserActive: testBrowser?.isConnected() || false,
            currentUrl: testPage ? await testPage.url().catch(() => null) : null,
          }));
          return;
        }

        if (path === '/logs' && req.method === 'GET') {
          res.writeHead(200, corsHeaders);
          res.end(JSON.stringify({ logs: sessionLogs }));
          return;
        }

        if (path === '/execute' && req.method === 'POST') {
          let body = '';
          for await (const chunk of req) {
            body += chunk;
          }
          const parsed = JSON.parse(body) as ExecuteRequest;
          const result = await executeAction(parsed);
          res.writeHead(200, corsHeaders);
          res.end(JSON.stringify(result));
          return;
        }

        if (path === '/close' && req.method === 'POST') {
          await closeBrowser();
          res.writeHead(200, corsHeaders);
          res.end(JSON.stringify({ success: true }));
          return;
        }

        res.writeHead(404, corsHeaders);
        res.end(JSON.stringify({ error: 'Not found' }));

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ error: errorMessage }));
      }
    });

    server.listen(port, () => {
      log('info', `HTTP API listening on port ${port}`);
    });
  });
}
