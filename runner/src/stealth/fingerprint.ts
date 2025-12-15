/**
 * Browser Fingerprint Management using Apify's fingerprint libraries
 * Uses fingerprint-generator and fingerprint-injector for production-grade fingerprinting
 * Falls back to manual implementation if libraries not available
 */

import { BrowserContext, Page } from 'playwright';

// Dynamic imports for ES modules
let FingerprintGenerator: any;
let FingerprintInjector: any;
let fingerprintGeneratorLoaded = false;
let loadAttempted = false;

async function loadFingerprintLibraries(): Promise<boolean> {
  if (fingerprintGeneratorLoaded) return true;
  if (loadAttempted) return false;
  
  loadAttempted = true;
  
  try {
    const generatorModule = await import('fingerprint-generator');
    const injectorModule = await import('fingerprint-injector');
    
    FingerprintGenerator = generatorModule.FingerprintGenerator || generatorModule.default;
    FingerprintInjector = injectorModule.FingerprintInjector || injectorModule.default;
    
    fingerprintGeneratorLoaded = true;
    console.log('[Fingerprint] Loaded fingerprint-generator and fingerprint-injector');
    return true;
  } catch (e) {
    console.warn('[Fingerprint] Libraries not available, using fallback:', e);
    return false;
  }
}

export interface FingerprintConfig {
  // Browser type
  browsers?: Array<{ name: 'chrome' | 'firefox' | 'safari' | 'edge'; minVersion?: number }>;
  // Device type
  devices?: ('desktop' | 'mobile')[];
  // Operating systems
  operatingSystems?: ('windows' | 'macos' | 'linux' | 'android' | 'ios')[];
  // Locales
  locales?: string[];
  // Screen constraints
  screen?: {
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
  };
}

// Cached fingerprint for session consistency
let cachedFingerprint: any = null;
let cachedFingerprintConfig: string = '';

/**
 * Generate a fingerprint using fingerprint-generator library
 */
export async function generateFingerprint(config: FingerprintConfig = {}): Promise<any> {
  const configKey = JSON.stringify(config);
  
  // Return cached fingerprint if config hasn't changed
  if (cachedFingerprint && cachedFingerprintConfig === configKey) {
    return cachedFingerprint;
  }

  const loaded = await loadFingerprintLibraries();
  
  if (loaded && FingerprintGenerator) {
    try {
      const generator = new FingerprintGenerator({
        browsers: config.browsers || [{ name: 'chrome', minVersion: 100 }],
        devices: config.devices || ['desktop'],
        operatingSystems: config.operatingSystems || ['windows', 'macos'],
        screen: config.screen,
      });

      const result = generator.getFingerprint({
        locales: config.locales || ['en-US', 'en'],
      });

      cachedFingerprint = result;
      cachedFingerprintConfig = configKey;
      
      console.log('[Fingerprint] Generated via fingerprint-generator:', {
        userAgent: result.fingerprint?.navigator?.userAgent?.substring(0, 60) + '...',
        platform: result.fingerprint?.navigator?.platform,
        screen: result.fingerprint?.screen,
      });

      return result;
    } catch (e) {
      console.error('[Fingerprint] Generation failed, using fallback:', e);
    }
  }

  // Fallback to manual fingerprint generation
  const fallback = generateFallbackFingerprint(config);
  cachedFingerprint = fallback;
  cachedFingerprintConfig = configKey;
  return fallback;
}

/**
 * Inject fingerprint into browser context using fingerprint-injector
 */
export async function injectFingerprint(
  context: BrowserContext,
  fingerprint?: any
): Promise<boolean> {
  const loaded = await loadFingerprintLibraries();
  
  if (!fingerprint) {
    fingerprint = await generateFingerprint();
  }

  if (loaded && FingerprintInjector) {
    try {
      const injector = new FingerprintInjector();
      await injector.attachFingerprintToPlaywright(context, fingerprint);
      console.log('[Fingerprint] Successfully injected via fingerprint-injector');
      return true;
    } catch (e) {
      console.error('[Fingerprint] Injection failed, using fallback:', e);
    }
  }

  // Fallback to manual injection
  return await injectFallbackFingerprint(context, fingerprint);
}

/**
 * Create browser context options with fingerprint
 */
export async function getFingerprintedContextOptions(config: FingerprintConfig = {}): Promise<any> {
  const fingerprint = await generateFingerprint(config);
  
  const fp = fingerprint.fingerprint || fingerprint;
  const nav = fp.navigator || {};
  const screen = fp.screen || {};
  
  return {
    userAgent: nav.userAgent,
    locale: nav.language || 'en-US',
    timezoneId: 'America/New_York',
    viewport: {
      width: screen.width || 1920,
      height: screen.height || 1080,
    },
    deviceScaleFactor: screen.devicePixelRatio || screen.pixelRatio || 1,
    hasTouch: false,
    isMobile: false,
    // The fingerprint object for later injection
    _fingerprint: fingerprint,
  };
}

// ============ Legacy Interface (for backwards compatibility) ============

export interface Fingerprint {
  hardwareConcurrency: number;
  deviceMemory: number;
  platform: string;
  webgl: {
    vendor: string;
    renderer: string;
    unmaskedVendor: string;
    unmaskedRenderer: string;
  };
  screen: {
    width: number;
    height: number;
    availWidth: number;
    availHeight: number;
    colorDepth: number;
    pixelRatio: number;
  };
  userAgent: string;
  appVersion: string;
  canvasNoiseSeed: number;
  audioNoiseSeed: number;
  webrtc: { disabled: boolean };
  fonts: string[];
}

// ============ Fallback Implementation ============

const FALLBACK_PRESETS: Fingerprint[] = [
  // Windows 10 Chrome - Most common
  {
    hardwareConcurrency: 8,
    deviceMemory: 8,
    platform: 'Win32',
    webgl: {
      vendor: 'Google Inc. (Intel)',
      renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      unmaskedVendor: 'Google Inc. (Intel)',
      unmaskedRenderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    },
    screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelRatio: 1 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    appVersion: '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    canvasNoiseSeed: 0.1234567890,
    audioNoiseSeed: 0.0000001,
    webrtc: { disabled: false },
    fonts: ['Arial', 'Arial Black', 'Calibri', 'Cambria', 'Comic Sans MS', 'Consolas', 'Courier New', 'Georgia', 'Impact', 'Lucida Console', 'Microsoft Sans Serif', 'Palatino Linotype', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'],
  },
  // Windows 11 Chrome with NVIDIA
  {
    hardwareConcurrency: 12,
    deviceMemory: 16,
    platform: 'Win32',
    webgl: {
      vendor: 'Google Inc. (NVIDIA)',
      renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      unmaskedVendor: 'Google Inc. (NVIDIA)',
      unmaskedRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    },
    screen: { width: 2560, height: 1440, availWidth: 2560, availHeight: 1400, colorDepth: 24, pixelRatio: 1 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    appVersion: '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    canvasNoiseSeed: 0.9876543210,
    audioNoiseSeed: 0.0000002,
    webrtc: { disabled: false },
    fonts: ['Arial', 'Arial Black', 'Calibri', 'Cambria', 'Comic Sans MS', 'Consolas', 'Courier New', 'Georgia', 'Impact', 'Lucida Console', 'Microsoft Sans Serif', 'Palatino Linotype', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'],
  },
  // MacOS Chrome - Apple Silicon
  {
    hardwareConcurrency: 8,
    deviceMemory: 8,
    platform: 'MacIntel',
    webgl: {
      vendor: 'Google Inc. (Apple)',
      renderer: 'ANGLE (Apple, Apple M1 Pro, OpenGL 4.1)',
      unmaskedVendor: 'Google Inc. (Apple)',
      unmaskedRenderer: 'ANGLE (Apple, Apple M1 Pro, OpenGL 4.1)',
    },
    screen: { width: 1728, height: 1117, availWidth: 1728, availHeight: 1079, colorDepth: 30, pixelRatio: 2 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    appVersion: '5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    canvasNoiseSeed: 0.5555555555,
    audioNoiseSeed: 0.0000003,
    webrtc: { disabled: false },
    fonts: ['Arial', 'Arial Black', 'Comic Sans MS', 'Courier New', 'Georgia', 'Helvetica', 'Helvetica Neue', 'Impact', 'Lucida Grande', 'Monaco', 'Palatino', 'Times', 'Times New Roman', 'Trebuchet MS', 'Verdana'],
  },
  // Linux Chrome
  {
    hardwareConcurrency: 8,
    deviceMemory: 8,
    platform: 'Linux x86_64',
    webgl: {
      vendor: 'Google Inc. (Intel)',
      renderer: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 630 (CFL GT2), OpenGL 4.6)',
      unmaskedVendor: 'Google Inc. (Intel)',
      unmaskedRenderer: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 630 (CFL GT2), OpenGL 4.6)',
    },
    screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1053, colorDepth: 24, pixelRatio: 1 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    appVersion: '5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    canvasNoiseSeed: 0.3333333333,
    audioNoiseSeed: 0.0000004,
    webrtc: { disabled: false },
    fonts: ['Arial', 'Courier New', 'DejaVu Sans', 'DejaVu Sans Mono', 'DejaVu Serif', 'Droid Sans', 'Droid Sans Mono', 'FreeMono', 'FreeSans', 'FreeSerif', 'Liberation Mono', 'Liberation Sans', 'Liberation Serif', 'Noto Sans', 'Times New Roman', 'Ubuntu', 'Ubuntu Mono'],
  },
];

function generateFallbackFingerprint(config: FingerprintConfig = {}): any {
  // Pick random preset weighted by real-world usage
  const weights = [0.45, 0.30, 0.15, 0.10]; // Windows most common
  const random = Math.random();
  let cumulative = 0;
  let presetIndex = 0;

  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (random < cumulative) {
      presetIndex = i;
      break;
    }
  }

  const preset = FALLBACK_PRESETS[presetIndex];
  
  // Create deep copy with randomization
  const fp = JSON.parse(JSON.stringify(preset));
  
  // Randomize hardware slightly
  fp.hardwareConcurrency = [4, 6, 8, 10, 12, 16][Math.floor(Math.random() * 6)];
  fp.deviceMemory = [4, 8, 16, 32][Math.floor(Math.random() * 4)];
  
  // Generate unique noise seeds for this session
  const sessionSeed = Math.random();
  fp.canvasNoiseSeed = preset.canvasNoiseSeed + (sessionSeed * 0.0001);
  fp.audioNoiseSeed = preset.audioNoiseSeed + (sessionSeed * 0.00000001);
  
  console.log('[Fingerprint] Generated fallback fingerprint:', {
    platform: fp.platform,
    hardwareConcurrency: fp.hardwareConcurrency,
    screen: fp.screen,
  });
  
  // Wrap in structure compatible with fingerprint-generator
  return {
    fingerprint: {
      navigator: {
        userAgent: fp.userAgent,
        appVersion: fp.appVersion,
        platform: fp.platform,
        language: 'en-US',
        languages: ['en-US', 'en'],
        hardwareConcurrency: fp.hardwareConcurrency,
        deviceMemory: fp.deviceMemory,
        maxTouchPoints: 0,
      },
      screen: fp.screen,
      webgl: fp.webgl,
      fonts: fp.fonts,
      canvasNoiseSeed: fp.canvasNoiseSeed,
      audioNoiseSeed: fp.audioNoiseSeed,
    },
  };
}

async function injectFallbackFingerprint(
  context: BrowserContext,
  fingerprint: any
): Promise<boolean> {
  try {
    const fp = fingerprint.fingerprint || fingerprint;
    const nav = fp.navigator || {};
    const screen = fp.screen || {};
    const webgl = fp.webgl || {};

    const script = `
      (function() {
        // ========== HARDWARE ==========
        const navigatorProps = {
          hardwareConcurrency: ${nav.hardwareConcurrency || 8},
          deviceMemory: ${nav.deviceMemory || 8},
          maxTouchPoints: ${nav.maxTouchPoints || 0},
          language: '${nav.language || 'en-US'}',
          languages: ${JSON.stringify(nav.languages || ['en-US', 'en'])},
          platform: '${nav.platform || 'Win32'}',
        };
        
        for (const [key, value] of Object.entries(navigatorProps)) {
          try {
            Object.defineProperty(navigator, key, { get: () => value, configurable: true });
          } catch (e) {}
        }
        
        // ========== SCREEN ==========
        const screenProps = {
          width: ${screen.width || 1920},
          height: ${screen.height || 1080},
          availWidth: ${screen.availWidth || 1920},
          availHeight: ${screen.availHeight || 1040},
          colorDepth: ${screen.colorDepth || 24},
          pixelDepth: ${screen.colorDepth || 24},
        };
        
        for (const [key, value] of Object.entries(screenProps)) {
          try {
            Object.defineProperty(screen, key, { get: () => value, configurable: true });
          } catch (e) {}
        }
        
        Object.defineProperty(window, 'devicePixelRatio', { get: () => ${screen.pixelRatio || 1}, configurable: true });
        
        // ========== WEBGL ==========
        const getParameterProxy = {
          apply: function(target, thisArg, args) {
            const param = args[0];
            if (param === 37445) return '${webgl.unmaskedVendor || webgl.vendor || 'Google Inc. (NVIDIA)'}';
            if (param === 37446) return '${webgl.unmaskedRenderer || webgl.renderer || 'ANGLE (NVIDIA GeForce RTX 3060)'}';
            if (param === 7936) return '${webgl.vendor || 'Google Inc. (NVIDIA)'}';
            if (param === 7937) return '${webgl.renderer || 'ANGLE (NVIDIA GeForce RTX 3060)'}';
            return Reflect.apply(target, thisArg, args);
          }
        };
        
        ['WebGLRenderingContext', 'WebGL2RenderingContext'].forEach(ctx => {
          if (window[ctx]) {
            const original = window[ctx].prototype.getParameter;
            window[ctx].prototype.getParameter = new Proxy(original, getParameterProxy);
          }
        });
        
        // ========== CANVAS NOISE ==========
        const noiseSeed = ${fp.canvasNoiseSeed || 0.12345};
        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
          const context = this.getContext('2d');
          if (context && this.width > 0 && this.height > 0) {
            try {
              const imageData = context.getImageData(0, 0, Math.min(this.width, 10), Math.min(this.height, 10));
              for (let i = 0; i < imageData.data.length; i += 4) {
                imageData.data[i] = imageData.data[i] ^ (Math.floor(noiseSeed * 255) & 1);
              }
              context.putImageData(imageData, 0, 0);
            } catch(e) {}
          }
          return originalToDataURL.apply(this, arguments);
        };
        
        // ========== AUDIO FINGERPRINT ==========
        const audioNoise = ${fp.audioNoiseSeed || 0.0000001};
        if (window.AudioContext || window.webkitAudioContext) {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          const originalCreateAnalyser = AudioContext.prototype.createAnalyser;
          AudioContext.prototype.createAnalyser = function() {
            const analyser = originalCreateAnalyser.apply(this, arguments);
            const originalGetFloatFrequencyData = analyser.getFloatFrequencyData;
            analyser.getFloatFrequencyData = function(array) {
              originalGetFloatFrequencyData.apply(this, arguments);
              for (let i = 0; i < array.length; i++) {
                array[i] = array[i] + audioNoise;
              }
            };
            return analyser;
          };
        }
        
        // ========== PLUGINS ==========
        Object.defineProperty(navigator, 'plugins', {
          get: () => {
            const plugins = [
              { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
              { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
              { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
            ];
            plugins.length = 3;
            return plugins;
          }
        });
        
        // ========== MIMETYPES ==========
        Object.defineProperty(navigator, 'mimeTypes', {
          get: () => {
            const mimeTypes = [
              { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
              { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' },
              { type: 'application/x-nacl', suffixes: '', description: 'Native Client Executable' }
            ];
            mimeTypes.length = 3;
            return mimeTypes;
          }
        });
        
        // ========== CONNECTION ==========
        if (navigator.connection) {
          Object.defineProperty(navigator.connection, 'effectiveType', { get: () => '4g' });
          Object.defineProperty(navigator.connection, 'rtt', { get: () => 50 });
          Object.defineProperty(navigator.connection, 'downlink', { get: () => 10 });
        }
        
        // ========== BATTERY ==========
        if (navigator.getBattery) {
          navigator.getBattery = () => Promise.resolve({
            charging: true,
            chargingTime: 0,
            dischargingTime: Infinity,
            level: 1,
            addEventListener: () => {},
            removeEventListener: () => {}
          });
        }
        
        console.log('[Fingerprint] Applied fallback fingerprint');
      })();
    `;

    await context.addInitScript(script);
    console.log('[Fingerprint] Injected fallback fingerprint script');
    return true;
  } catch (e) {
    console.error('[Fingerprint] Fallback injection failed:', e);
    return false;
  }
}

/**
 * Apply fingerprint to a specific page (for verification)
 */
export async function applyFingerprintToPage(page: Page, fingerprint?: any): Promise<void> {
  if (!fingerprint) {
    fingerprint = cachedFingerprint || await generateFingerprint();
  }

  const fp = fingerprint.fingerprint || fingerprint;
  const nav = fp.navigator || {};
  
  // Verify fingerprint is applied
  await page.evaluate((expected) => {
    console.log('[Fingerprint Check]', {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency,
      expectedPlatform: expected.platform,
    });
  }, { platform: nav.platform });
}

/**
 * Clear cached fingerprint
 */
export function clearFingerprintCache(): void {
  cachedFingerprint = null;
  cachedFingerprintConfig = '';
  console.log('[Fingerprint] Cache cleared');
}

// Legacy exports for backwards compatibility
export const FINGERPRINT_PRESETS = FALLBACK_PRESETS.reduce((acc, fp, i) => {
  const keys = ['windows_chrome_standard', 'windows_chrome_nvidia', 'macos_chrome', 'linux_chrome'];
  acc[keys[i]] = fp;
  return acc;
}, {} as Record<string, Fingerprint>);

export function getRandomPreset(): string {
  const presets = Object.keys(FINGERPRINT_PRESETS);
  const weights = [0.45, 0.30, 0.15, 0.10];
  const random = Math.random();
  let cumulative = 0;

  for (let i = 0; i < presets.length; i++) {
    cumulative += weights[i];
    if (random < cumulative) {
      return presets[i];
    }
  }

  return presets[0];
}

export function getFingerprintScript(fp: Fingerprint): string {
  // Legacy function - wrap in new format and call injectFallbackFingerprint logic
  return `
    (function() {
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => ${fp.hardwareConcurrency} });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => ${fp.deviceMemory} });
      Object.defineProperty(navigator, 'platform', { get: () => '${fp.platform}' });
      
      const screenProps = {
        width: ${fp.screen.width},
        height: ${fp.screen.height},
        availWidth: ${fp.screen.availWidth},
        availHeight: ${fp.screen.availHeight},
        colorDepth: ${fp.screen.colorDepth},
        pixelDepth: ${fp.screen.colorDepth},
      };
      
      Object.keys(screenProps).forEach(prop => {
        Object.defineProperty(screen, prop, { get: () => screenProps[prop], configurable: true });
      });
      
      Object.defineProperty(window, 'devicePixelRatio', { get: () => ${fp.screen.pixelRatio} });
      
      const getParameterProxy = {
        apply: function(target, thisArg, args) {
          const param = args[0];
          if (param === 37445) return '${fp.webgl.unmaskedVendor}';
          if (param === 37446) return '${fp.webgl.unmaskedRenderer}';
          return Reflect.apply(target, thisArg, args);
        }
      };
      
      ['WebGLRenderingContext', 'WebGL2RenderingContext'].forEach(ctx => {
        if (window[ctx]) {
          window[ctx].prototype.getParameter = new Proxy(window[ctx].prototype.getParameter, getParameterProxy);
        }
      });
      
      console.log('[Fingerprint] Applied legacy fingerprint profile');
    })();
  `;
}
