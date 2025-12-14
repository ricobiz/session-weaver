/**
 * Browser Warmup & Cookie Generation
 * Creates realistic browsing history and cookies to appear as a "lived-in" browser
 */

import { Page, BrowserContext } from 'playwright';
import { humanMouseMove, humanClick, humanScroll, humanType, randomDelay } from './human-behavior';

export interface WarmupConfig {
  // Sites to visit for warmup
  warmupSites: WarmupSite[];
  // How long to spend on each site (ms)
  timePerSite: number;
  // Whether to interact with sites (scroll, click, etc.)
  interactWithSites: boolean;
  // Generate localStorage/sessionStorage
  generateStorage: boolean;
  // Add common cookies
  addCommonCookies: boolean;
}

interface WarmupSite {
  url: string;
  actions?: ('scroll' | 'click' | 'hover' | 'wait')[];
}

const DEFAULT_WARMUP_SITES: WarmupSite[] = [
  { url: 'https://www.google.com/', actions: ['scroll', 'wait'] },
  { url: 'https://www.wikipedia.org/', actions: ['scroll', 'click', 'wait'] },
  { url: 'https://www.youtube.com/', actions: ['scroll', 'wait'] },
  { url: 'https://www.reddit.com/', actions: ['scroll', 'wait'] },
  { url: 'https://www.amazon.com/', actions: ['scroll', 'wait'] },
  { url: 'https://news.ycombinator.com/', actions: ['scroll', 'wait'] },
  { url: 'https://www.github.com/', actions: ['scroll', 'wait'] },
];

const COMMON_COOKIES = [
  // Google cookies
  { name: 'NID', value: generateRandomCookieValue(188), domain: '.google.com', path: '/', expires: Date.now() / 1000 + 15552000 },
  { name: 'CONSENT', value: 'YES+cb.20231025-17-p0.en+FX+' + Math.floor(Math.random() * 999), domain: '.google.com', path: '/', expires: -1 },
  
  // YouTube cookies
  { name: 'VISITOR_INFO1_LIVE', value: generateRandomCookieValue(11), domain: '.youtube.com', path: '/', expires: Date.now() / 1000 + 15552000 },
  { name: 'PREF', value: 'f6=' + Math.floor(Math.random() * 4000000), domain: '.youtube.com', path: '/', expires: -1 },
  
  // General tracking-like cookies (to appear as a regular browser)
  { name: '_ga', value: 'GA1.1.' + Math.floor(Math.random() * 1000000000) + '.' + Math.floor(Date.now() / 1000 - Math.random() * 10000000), domain: '.example.com', path: '/', expires: Date.now() / 1000 + 63072000 },
];

function generateRandomCookieValue(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Perform browser warmup - visit common sites to generate realistic history and cookies
 */
export async function warmupBrowser(
  context: BrowserContext,
  page: Page,
  config: Partial<WarmupConfig> = {}
): Promise<WarmupResult> {
  const cfg: WarmupConfig = {
    warmupSites: config.warmupSites || DEFAULT_WARMUP_SITES.slice(0, 3), // Default to 3 sites
    timePerSite: config.timePerSite || 3000,
    interactWithSites: config.interactWithSites !== false,
    generateStorage: config.generateStorage !== false,
    addCommonCookies: config.addCommonCookies !== false,
  };

  const result: WarmupResult = {
    sitesVisited: [],
    cookiesAdded: 0,
    storageKeysAdded: 0,
    totalDuration: 0,
    errors: [],
  };

  const startTime = Date.now();

  // Add common cookies first
  if (cfg.addCommonCookies) {
    try {
      await context.addCookies(COMMON_COOKIES.map(c => ({
        ...c,
        expires: c.expires === -1 ? undefined : c.expires,
      })));
      result.cookiesAdded += COMMON_COOKIES.length;
    } catch (e) {
      result.errors.push(`Cookie injection failed: ${e}`);
    }
  }

  // Visit warmup sites
  for (const site of cfg.warmupSites) {
    try {
      await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      result.sitesVisited.push(site.url);

      // Wait for page to settle
      await randomDelay(500, 1000);

      // Perform interactions if enabled
      if (cfg.interactWithSites && site.actions) {
        for (const action of site.actions) {
          try {
            switch (action) {
              case 'scroll':
                await humanScroll(page, 'down', 200 + Math.random() * 300);
                await randomDelay(300, 800);
                break;
              case 'click':
                // Click on a safe area (usually body or main content)
                const viewport = page.viewportSize();
                if (viewport) {
                  await humanMouseMove(page, viewport.width / 2, viewport.height / 2);
                }
                break;
              case 'hover':
                const vp = page.viewportSize();
                if (vp) {
                  await humanMouseMove(page, vp.width * (0.3 + Math.random() * 0.4), vp.height * (0.3 + Math.random() * 0.4));
                }
                await randomDelay(200, 500);
                break;
              case 'wait':
                await randomDelay(cfg.timePerSite * 0.3, cfg.timePerSite * 0.7);
                break;
            }
          } catch (e) {
            // Ignore interaction errors
          }
        }
      }

      // Generate localStorage/sessionStorage entries
      if (cfg.generateStorage) {
        try {
          await page.evaluate(() => {
            // Add some realistic storage entries
            const storageData = {
              'theme': Math.random() > 0.5 ? 'dark' : 'light',
              'lang': 'en',
              'visited': Date.now().toString(),
              'consent': 'true',
              'cookieConsent': JSON.stringify({ analytics: true, marketing: false }),
            };
            
            for (const [key, value] of Object.entries(storageData)) {
              try {
                localStorage.setItem(key, value);
              } catch (e) {}
            }
            
            try {
              sessionStorage.setItem('sessionStart', Date.now().toString());
            } catch (e) {}
          });
          result.storageKeysAdded += 6;
        } catch (e) {
          // Ignore storage errors (some sites block it)
        }
      }

      // Random delay before next site
      await randomDelay(500, 1500);

    } catch (e) {
      result.errors.push(`Failed to visit ${site.url}: ${e}`);
    }
  }

  result.totalDuration = Date.now() - startTime;
  return result;
}

export interface WarmupResult {
  sitesVisited: string[];
  cookiesAdded: number;
  storageKeysAdded: number;
  totalDuration: number;
  errors: string[];
}

/**
 * Generate realistic cookies for specific domains
 */
export async function generateCookiesForDomain(
  context: BrowserContext,
  domain: string,
  options: { includeTracking?: boolean; includeSession?: boolean } = {}
): Promise<number> {
  const cookies: any[] = [];
  const baseDomain = domain.startsWith('.') ? domain : '.' + domain;

  // Session-like cookies
  if (options.includeSession !== false) {
    cookies.push({
      name: 'session_id',
      value: generateRandomCookieValue(32),
      domain: baseDomain,
      path: '/',
      httpOnly: true,
      secure: true,
    });
  }

  // Tracking-like cookies (appear more "normal")
  if (options.includeTracking !== false) {
    cookies.push(
      {
        name: '_ga',
        value: `GA1.2.${Math.floor(Math.random() * 1000000000)}.${Math.floor(Date.now() / 1000 - Math.random() * 5000000)}`,
        domain: baseDomain,
        path: '/',
        expires: Date.now() / 1000 + 63072000,
      },
      {
        name: '_gid',
        value: `GA1.2.${Math.floor(Math.random() * 1000000000)}.${Math.floor(Date.now() / 1000)}`,
        domain: baseDomain,
        path: '/',
        expires: Date.now() / 1000 + 86400,
      },
      {
        name: '_fbp',
        value: `fb.1.${Date.now()}.${Math.floor(Math.random() * 1000000000)}`,
        domain: baseDomain,
        path: '/',
        expires: Date.now() / 1000 + 7776000,
      }
    );
  }

  // Consent cookies
  cookies.push({
    name: 'cookieconsent_status',
    value: 'dismiss',
    domain: baseDomain,
    path: '/',
  });

  await context.addCookies(cookies);
  return cookies.length;
}

/**
 * Save and load browser state (cookies, localStorage, sessionStorage)
 */
export async function saveBrowserState(context: BrowserContext, page: Page): Promise<BrowserState> {
  // Get storage state (includes cookies and localStorage)
  const storageState = await context.storageState();

  // Get sessionStorage separately
  const sessionStorage = await page.evaluate(() => {
    const storage: Record<string, string> = {};
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i);
      if (key) {
        storage[key] = window.sessionStorage.getItem(key) || '';
      }
    }
    return storage;
  });

  return {
    ...storageState,
    sessionStorage,
  };
}

export interface BrowserState {
  cookies: any[];
  origins: any[];
  sessionStorage: Record<string, string>;
}

/**
 * Load previously saved browser state
 */
export async function loadBrowserState(
  context: BrowserContext,
  page: Page,
  state: BrowserState
): Promise<void> {
  // Add cookies
  if (state.cookies && state.cookies.length > 0) {
    await context.addCookies(state.cookies);
  }

  // Add localStorage via page context
  if (state.origins && state.origins.length > 0) {
    for (const origin of state.origins) {
      if (origin.localStorage && origin.localStorage.length > 0) {
        await page.addInitScript((data: { origin: string; storage: any[] }) => {
          if (window.location.origin === data.origin) {
            for (const item of data.storage) {
              window.localStorage.setItem(item.name, item.value);
            }
          }
        }, { origin: origin.origin, storage: origin.localStorage });
      }
    }
  }

  // Add sessionStorage
  if (state.sessionStorage && Object.keys(state.sessionStorage).length > 0) {
    await page.addInitScript((storage: Record<string, string>) => {
      for (const [key, value] of Object.entries(storage)) {
        window.sessionStorage.setItem(key, value);
      }
    }, state.sessionStorage);
  }
}
