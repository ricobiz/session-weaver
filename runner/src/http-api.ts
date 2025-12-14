import { createServer, IncomingMessage, ServerResponse } from 'http';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { log } from './logger';
import { applyStealthPatches } from './stealth';
import { generateFingerprint, getRandomPreset } from './stealth/fingerprint';
import { humanType, humanClick, humanScroll, randomDelay } from './stealth/human-behavior';

interface ExecuteRequest {
  action: 'screenshot' | 'navigate' | 'click' | 'type' | 'scroll' | 'evaluate';
  url?: string;
  selector?: string;
  text?: string;
  coordinates?: { x: number; y: number };
  script?: string;
  timeout?: number;
  speed?: 'slow' | 'normal' | 'fast';
  clear_first?: boolean;
  press_enter?: boolean;
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
          // Use human-like click with mouse movement
          await humanClick(page, req.coordinates.x, req.coordinates.y);
        } else if (req.selector) {
          logAction(`Clicking selector: ${req.selector}`);
          // Get element position and use human-like click
          const element = await page.waitForSelector(req.selector, { timeout });
          if (element) {
            const box = await element.boundingBox();
            if (box) {
              const clickX = box.x + box.width * (0.3 + Math.random() * 0.4);
              const clickY = box.y + box.height * (0.3 + Math.random() * 0.4);
              await humanClick(page, clickX, clickY);
            } else {
              await element.click();
            }
          }
        } else {
          throw new Error('Selector or coordinates required for click');
        }
        
        await randomDelay(300, 600);
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
        const speed = req.speed || 'normal';
        const clearFirst = req.clear_first !== false;
        const pressEnter = req.press_enter === true;
        
        logAction(`Typing: "${req.text.slice(0, 50)}${req.text.length > 50 ? '...' : ''}" (speed=${speed})`);
        
        // Click on selector first if provided
        if (req.selector) {
          const element = await page.waitForSelector(req.selector, { timeout });
          if (element) {
            const box = await element.boundingBox();
            if (box) {
              const clickX = box.x + box.width * (0.3 + Math.random() * 0.4);
              const clickY = box.y + box.height * (0.3 + Math.random() * 0.4);
              await humanClick(page, clickX, clickY);
            } else {
              await element.click();
            }
            await randomDelay(100, 200);
          }
        }
        
        // Clear existing text if requested
        if (clearFirst) {
          await page.keyboard.press('Control+a');
          await randomDelay(30, 80);
          await page.keyboard.press('Backspace');
          await randomDelay(50, 100);
        }
        
        // Use human-like typing with variable delays
        await humanType(page, req.text, { 
          typingSpeed: speed,
          typingMistakes: false, // Disabled for reliability
          randomDelays: true,
        });
        
        // Press Enter if requested
        if (pressEnter) {
          await randomDelay(100, 200);
          await page.keyboard.press('Enter');
          logAction('Pressed Enter');
        }
        
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
        const direction = amount > 0 ? 'down' : 'up';
        logAction(`Scrolling ${direction}: ${Math.abs(amount)}px`);
        
        // Use human-like scrolling
        await humanScroll(page, direction, Math.abs(amount));
        
        await randomDelay(200, 400);
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

async function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function getCurrentUrl(): Promise<string | null> {
  try {
    return testPage ? testPage.url() : null;
  } catch {
    return null;
  }
}

// HTTP Server using Node.js http module
export function startHttpApi(port: number = 3001): void {
  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    const urlPath = req.url || '/';
    const path = urlPath.split('?')[0];

    try {
      // GET /health - Health check
      if (path === '/health' && req.method === 'GET') {
        const currentUrl = await getCurrentUrl();
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({
          status: 'ok',
          browserActive: testBrowser?.isConnected() || false,
          currentUrl,
        }));
        return;
      }

      // GET /logs - Get recent logs
      if (path === '/logs' && req.method === 'GET') {
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({ logs: sessionLogs }));
        return;
      }

      // POST /execute - Execute an action
      if (path === '/execute' && req.method === 'POST') {
        const body = await parseBody(req);
        const parsed = JSON.parse(body) as ExecuteRequest;
        const result = await executeAction(parsed);
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify(result));
        return;
      }

      // POST /close - Close browser
      if (path === '/close' && req.method === 'POST') {
        await closeBrowser();
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({ success: true }));
        return;
      }

      // 404
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
}
