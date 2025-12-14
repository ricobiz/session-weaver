import { Page } from 'playwright';
import { LogFunction } from '../types';

// Captcha detection patterns
const CAPTCHA_SELECTORS = {
  recaptcha: [
    'iframe[src*="recaptcha"]',
    '.g-recaptcha',
    '#recaptcha',
    '[data-sitekey]',
  ],
  hcaptcha: [
    'iframe[src*="hcaptcha"]',
    '.h-captcha',
    '[data-hcaptcha-sitekey]',
  ],
  cloudflare: [
    'iframe[src*="challenges.cloudflare"]',
    '.cf-turnstile',
    '#challenge-running',
    '#challenge-form',
  ],
  generic: [
    'input[name*="captcha"]',
    'img[src*="captcha"]',
    '[class*="captcha"]',
    '[id*="captcha"]',
  ],
};

export interface CaptchaDetectionResult {
  detected: boolean;
  type: 'recaptcha' | 'hcaptcha' | 'cloudflare' | 'generic' | 'unknown';
  selector?: string;
  confidence: number;
}

export interface CaptchaResolveResult {
  success: boolean;
  type: string;
  duration_ms: number;
  method: string;
  error?: string;
}

export interface CaptchaResolver {
  name: string;
  canHandle: (type: string) => boolean;
  resolve: (page: Page, detection: CaptchaDetectionResult, log: LogFunction) => Promise<CaptchaResolveResult>;
}

// Detect captcha on the current page
export async function detectCaptcha(page: Page): Promise<CaptchaDetectionResult> {
  for (const [type, selectors] of Object.entries(CAPTCHA_SELECTORS)) {
    for (const selector of selectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const isVisible = await element.isVisible().catch(() => false);
          if (isVisible) {
            return {
              detected: true,
              type: type as CaptchaDetectionResult['type'],
              selector,
              confidence: type === 'generic' ? 0.6 : 0.9,
            };
          }
        }
      } catch {
        // Selector failed, continue
      }
    }
  }

  // Check for challenge page patterns in URL or content
  const url = page.url();
  if (url.includes('challenge') || url.includes('captcha')) {
    return {
      detected: true,
      type: 'unknown',
      confidence: 0.5,
    };
  }

  return {
    detected: false,
    type: 'unknown',
    confidence: 0,
  };
}

// Cloudflare challenge resolver (wait-based)
export const cloudflareResolver: CaptchaResolver = {
  name: 'cloudflare-wait',
  canHandle: (type) => type === 'cloudflare',
  
  async resolve(page, detection, log): Promise<CaptchaResolveResult> {
    const startTime = Date.now();
    log('info', 'Attempting Cloudflare challenge resolution (wait method)');

    try {
      // Wait for the challenge to auto-resolve
      // Cloudflare often resolves automatically after a few seconds
      await page.waitForFunction(
        () => {
          // Check if challenge elements are gone
          const challengeForm = document.querySelector('#challenge-form');
          const challengeRunning = document.querySelector('#challenge-running');
          return !challengeForm && !challengeRunning;
        },
        { timeout: 30000 }
      );

      // Additional wait for page to stabilize
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

      // Verify challenge is resolved
      const stillDetected = await detectCaptcha(page);
      if (!stillDetected.detected) {
        return {
          success: true,
          type: 'cloudflare',
          duration_ms: Date.now() - startTime,
          method: 'auto-wait',
        };
      }

      return {
        success: false,
        type: 'cloudflare',
        duration_ms: Date.now() - startTime,
        method: 'auto-wait',
        error: 'Challenge did not resolve automatically',
      };
    } catch (error) {
      return {
        success: false,
        type: 'cloudflare',
        duration_ms: Date.now() - startTime,
        method: 'auto-wait',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

// Simple wait resolver for transient captchas
export const waitResolver: CaptchaResolver = {
  name: 'wait',
  canHandle: () => true, // Fallback for any type
  
  async resolve(page, detection, log): Promise<CaptchaResolveResult> {
    const startTime = Date.now();
    log('info', `Attempting wait-based resolution for ${detection.type} captcha`);

    try {
      // Wait and check periodically
      for (let i = 0; i < 6; i++) {
        await page.waitForTimeout(5000);
        
        const stillDetected = await detectCaptcha(page);
        if (!stillDetected.detected) {
          return {
            success: true,
            type: detection.type,
            duration_ms: Date.now() - startTime,
            method: 'wait',
          };
        }
      }

      return {
        success: false,
        type: detection.type,
        duration_ms: Date.now() - startTime,
        method: 'wait',
        error: 'Captcha did not resolve within timeout',
      };
    } catch (error) {
      return {
        success: false,
        type: detection.type,
        duration_ms: Date.now() - startTime,
        method: 'wait',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

// Registry of resolvers
const resolvers: CaptchaResolver[] = [
  cloudflareResolver,
  waitResolver, // Fallback
];

// Main captcha resolution function
export async function resolveCaptcha(
  page: Page,
  detection: CaptchaDetectionResult,
  log: LogFunction
): Promise<CaptchaResolveResult> {
  log('info', `Attempting to resolve ${detection.type} captcha`);

  // Find a suitable resolver
  const resolver = resolvers.find(r => r.canHandle(detection.type));
  
  if (!resolver) {
    return {
      success: false,
      type: detection.type,
      duration_ms: 0,
      method: 'none',
      error: 'No resolver available for this captcha type',
    };
  }

  return resolver.resolve(page, detection, log);
}

// Register a custom resolver
export function registerResolver(resolver: CaptchaResolver): void {
  // Add at the beginning to prioritize custom resolvers
  resolvers.unshift(resolver);
}
