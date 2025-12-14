/**
 * Stealth & Anti-Detection Module
 * Patches browser to avoid detection
 */

import { Page, BrowserContext } from 'playwright';
import { Fingerprint } from './fingerprint';
import { log } from '../logger';

/**
 * Apply all stealth patches to a browser context
 */
export async function applyStealthPatches(
  context: BrowserContext,
  fingerprint?: Fingerprint
): Promise<void> {
  log('debug', 'Applying stealth patches to context');

  // Add init script to all pages
  await context.addInitScript(getStealthScript(fingerprint));
}

/**
 * Apply page-level stealth patches (called after each navigation)
 */
export async function applyPagePatches(page: Page): Promise<void> {
  // Override navigator properties that can leak
  await page.addInitScript(() => {
    // Hide webdriver
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });

    // Proper plugins array
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const plugins = [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
          { name: 'Native Client', filename: 'internal-nacl-plugin' },
        ];
        return plugins;
      },
    });

    // Languages consistency
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
  });
}

/**
 * Generate comprehensive stealth injection script
 */
function getStealthScript(fingerprint?: Fingerprint): string {
  const fp = fingerprint || getDefaultFingerprint();

  return `
    // ==========================================
    // STEALTH ANTI-DETECTION SCRIPT
    // ==========================================

    (function() {
      'use strict';

      // --- WebDriver Detection ---
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
        configurable: true
      });
      
      // Remove webdriver from window
      delete window.navigator.__proto__.webdriver;

      // --- Automation Flags ---
      // Chrome automation flags
      if (window.chrome) {
        window.chrome.runtime = {
          connect: function() {},
          sendMessage: function() {},
          onMessage: { addListener: function() {} },
        };
      } else {
        window.chrome = {
          runtime: {
            connect: function() {},
            sendMessage: function() {},
            onMessage: { addListener: function() {} },
          },
        };
      }

      // --- Permissions API ---
      const originalQuery = window.navigator.permissions?.query;
      if (originalQuery) {
        window.navigator.permissions.query = (parameters) => (
          parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
        );
      }

      // --- Plugins & MimeTypes ---
      const pluginsData = [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
      ];

      const mimeTypesData = [
        { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
        { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
      ];

      // Create plugin-like objects
      const createPluginArray = () => {
        const arr = pluginsData.map((p, i) => {
          const plugin = {
            ...p,
            length: 0,
            item: (i) => null,
            namedItem: (name) => null,
            [Symbol.iterator]: function* () {},
          };
          return plugin;
        });
        arr.item = (i) => arr[i] || null;
        arr.namedItem = (name) => arr.find(p => p.name === name) || null;
        arr.refresh = () => {};
        return arr;
      };

      Object.defineProperty(navigator, 'plugins', {
        get: () => createPluginArray(),
        configurable: true
      });

      Object.defineProperty(navigator, 'mimeTypes', {
        get: () => {
          const arr = mimeTypesData.map(m => ({ ...m, enabledPlugin: null }));
          arr.item = (i) => arr[i] || null;
          arr.namedItem = (name) => arr.find(m => m.type === name) || null;
          return arr;
        },
        configurable: true
      });

      // --- Hardware Concurrency ---
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => ${fp.hardwareConcurrency},
        configurable: true
      });

      // --- Device Memory ---
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => ${fp.deviceMemory},
        configurable: true
      });

      // --- Platform ---
      Object.defineProperty(navigator, 'platform', {
        get: () => '${fp.platform}',
        configurable: true
      });

      // --- WebGL Fingerprint ---
      const getParameterProxyHandler = {
        apply: function(target, thisArg, args) {
          const param = args[0];
          
          // Mask WebGL vendor
          if (param === 37445) {
            return '${fp.webgl.vendor}';
          }
          // Mask WebGL renderer
          if (param === 37446) {
            return '${fp.webgl.renderer}';
          }
          
          return Reflect.apply(target, thisArg, args);
        }
      };

      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
          const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
          WebGLRenderingContext.prototype.getParameter = new Proxy(originalGetParameter, getParameterProxyHandler);
        }
        
        const gl2 = canvas.getContext('webgl2');
        if (gl2) {
          const originalGetParameter2 = WebGL2RenderingContext.prototype.getParameter;
          WebGL2RenderingContext.prototype.getParameter = new Proxy(originalGetParameter2, getParameterProxyHandler);
        }
      } catch (e) {}

      // --- Canvas Fingerprint Noise ---
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function(type) {
        if (type === 'image/png' || type === undefined) {
          const ctx = this.getContext('2d');
          if (ctx) {
            // Add subtle noise to prevent fingerprinting
            const imageData = ctx.getImageData(0, 0, this.width, this.height);
            for (let i = 0; i < imageData.data.length; i += 4) {
              // Very subtle noise (±1) that doesn't affect visual appearance
              imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + (Math.random() > 0.5 ? 1 : -1)));
            }
            ctx.putImageData(imageData, 0, 0);
          }
        }
        return originalToDataURL.apply(this, arguments);
      };

      // --- Audio Context Fingerprint ---
      const originalCreateOscillator = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function() {
        const oscillator = originalCreateOscillator.apply(this, arguments);
        // Add minimal detuning to prevent fingerprinting
        const originalStart = oscillator.start.bind(oscillator);
        oscillator.start = function() {
          oscillator.detune.value = (Math.random() - 0.5) * 0.0001;
          return originalStart.apply(this, arguments);
        };
        return oscillator;
      };

      // --- Battery API ---
      if (navigator.getBattery) {
        navigator.getBattery = () => Promise.resolve({
          charging: true,
          chargingTime: 0,
          dischargingTime: Infinity,
          level: 1,
          addEventListener: () => {},
          removeEventListener: () => {},
        });
      }

      // --- Connection API ---
      if (navigator.connection) {
        Object.defineProperty(navigator, 'connection', {
          get: () => ({
            effectiveType: '4g',
            rtt: 50,
            downlink: 10,
            saveData: false,
          }),
          configurable: true
        });
      }

      // --- Iframe contentWindow protection ---
      const originalContentWindow = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
      if (originalContentWindow) {
        Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
          get: function() {
            const win = originalContentWindow.get.call(this);
            // Ensure iframes also don't leak webdriver
            if (win && win.navigator) {
              try {
                Object.defineProperty(win.navigator, 'webdriver', {
                  get: () => undefined
                });
              } catch (e) {}
            }
            return win;
          }
        });
      }

      // --- Headless Detection Prevention ---
      // Override toString to hide modifications
      const nativeToString = Function.prototype.toString;
      Function.prototype.toString = function() {
        if (this === window.navigator.permissions.query) {
          return 'function query() { [native code] }';
        }
        return nativeToString.call(this);
      };

      console.log('[Stealth] Anti-detection patches applied');
    })();
  `;
}

/**
 * Get default fingerprint values
 */
function getDefaultFingerprint(): Fingerprint {
  return {
    hardwareConcurrency: 8,
    deviceMemory: 8,
    platform: 'Win32',
    webgl: {
      vendor: 'Google Inc. (Intel)',
      renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0)',
    },
    screen: {
      width: 1920,
      height: 1080,
      colorDepth: 24,
      pixelRatio: 1,
    },
  };
}

export { Fingerprint } from './fingerprint';
