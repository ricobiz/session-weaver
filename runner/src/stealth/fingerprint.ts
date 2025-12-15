/**
 * Browser Fingerprint Configuration
 * Used to spoof various browser fingerprinting vectors for consistent fingerprints
 */

export interface Fingerprint {
  // Hardware
  hardwareConcurrency: number;
  deviceMemory: number;
  platform: string;

  // WebGL
  webgl: {
    vendor: string;
    renderer: string;
    unmaskedVendor: string;
    unmaskedRenderer: string;
  };

  // Screen - must match viewport exactly
  screen: {
    width: number;
    height: number;
    availWidth: number;
    availHeight: number;
    colorDepth: number;
    pixelRatio: number;
  };

  // User Agent components
  userAgent: string;
  appVersion: string;
  
  // Canvas noise seed (for consistent canvas fingerprint)
  canvasNoiseSeed: number;
  
  // Audio context noise
  audioNoiseSeed: number;
  
  // WebRTC
  webrtc: {
    disabled: boolean;
  };
  
  // Fonts to report
  fonts: string[];
}

// Comprehensive realistic fingerprint presets
export const FINGERPRINT_PRESETS: Record<string, Fingerprint> = {
  // Windows 10 Chrome - Most common configuration
  'windows_chrome_standard': {
    hardwareConcurrency: 8,
    deviceMemory: 8,
    platform: 'Win32',
    webgl: {
      vendor: 'Google Inc. (Intel)',
      renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      unmaskedVendor: 'Google Inc. (Intel)',
      unmaskedRenderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    },
    screen: { 
      width: 1920, 
      height: 1080, 
      availWidth: 1920, 
      availHeight: 1040, // Account for taskbar
      colorDepth: 24, 
      pixelRatio: 1 
    },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    appVersion: '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    canvasNoiseSeed: 0.1234567890,
    audioNoiseSeed: 0.0000001,
    webrtc: { disabled: false },
    fonts: [
      'Arial', 'Arial Black', 'Calibri', 'Cambria', 'Comic Sans MS', 
      'Consolas', 'Courier New', 'Georgia', 'Impact', 'Lucida Console',
      'Microsoft Sans Serif', 'Palatino Linotype', 'Segoe UI', 'Tahoma',
      'Times New Roman', 'Trebuchet MS', 'Verdana'
    ],
  },

  // Windows 11 Chrome with NVIDIA GPU
  'windows_chrome_nvidia': {
    hardwareConcurrency: 12,
    deviceMemory: 16,
    platform: 'Win32',
    webgl: {
      vendor: 'Google Inc. (NVIDIA)',
      renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      unmaskedVendor: 'Google Inc. (NVIDIA)',
      unmaskedRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    },
    screen: { 
      width: 2560, 
      height: 1440, 
      availWidth: 2560, 
      availHeight: 1400,
      colorDepth: 24, 
      pixelRatio: 1 
    },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    appVersion: '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    canvasNoiseSeed: 0.9876543210,
    audioNoiseSeed: 0.0000002,
    webrtc: { disabled: false },
    fonts: [
      'Arial', 'Arial Black', 'Calibri', 'Cambria', 'Comic Sans MS', 
      'Consolas', 'Courier New', 'Georgia', 'Impact', 'Lucida Console',
      'Microsoft Sans Serif', 'Palatino Linotype', 'Segoe UI', 'Tahoma',
      'Times New Roman', 'Trebuchet MS', 'Verdana'
    ],
  },

  // MacOS Chrome - Apple Silicon
  'macos_chrome': {
    hardwareConcurrency: 8,
    deviceMemory: 8,
    platform: 'MacIntel',
    webgl: {
      vendor: 'Google Inc. (Apple)',
      renderer: 'ANGLE (Apple, Apple M1 Pro, OpenGL 4.1)',
      unmaskedVendor: 'Google Inc. (Apple)',
      unmaskedRenderer: 'ANGLE (Apple, Apple M1 Pro, OpenGL 4.1)',
    },
    screen: { 
      width: 1728, 
      height: 1117, 
      availWidth: 1728, 
      availHeight: 1079,
      colorDepth: 30, 
      pixelRatio: 2 
    },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    appVersion: '5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    canvasNoiseSeed: 0.5555555555,
    audioNoiseSeed: 0.0000003,
    webrtc: { disabled: false },
    fonts: [
      'Arial', 'Arial Black', 'Comic Sans MS', 'Courier New', 'Georgia',
      'Helvetica', 'Helvetica Neue', 'Impact', 'Lucida Grande', 'Monaco',
      'Palatino', 'Times', 'Times New Roman', 'Trebuchet MS', 'Verdana'
    ],
  },

  // Linux Chrome
  'linux_chrome': {
    hardwareConcurrency: 8,
    deviceMemory: 8,
    platform: 'Linux x86_64',
    webgl: {
      vendor: 'Google Inc. (Intel)',
      renderer: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 630 (CFL GT2), OpenGL 4.6)',
      unmaskedVendor: 'Google Inc. (Intel)',
      unmaskedRenderer: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 630 (CFL GT2), OpenGL 4.6)',
    },
    screen: { 
      width: 1920, 
      height: 1080, 
      availWidth: 1920, 
      availHeight: 1053,
      colorDepth: 24, 
      pixelRatio: 1 
    },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    appVersion: '5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    canvasNoiseSeed: 0.3333333333,
    audioNoiseSeed: 0.0000004,
    webrtc: { disabled: false },
    fonts: [
      'Arial', 'Courier New', 'DejaVu Sans', 'DejaVu Sans Mono', 'DejaVu Serif',
      'Droid Sans', 'Droid Sans Mono', 'FreeMono', 'FreeSans', 'FreeSerif',
      'Liberation Mono', 'Liberation Sans', 'Liberation Serif', 'Noto Sans',
      'Times New Roman', 'Ubuntu', 'Ubuntu Mono'
    ],
  },
};

/**
 * Generate a fingerprint based on a preset
 * Each session gets a consistent fingerprint for the duration
 */
export function generateFingerprint(preset?: string): Fingerprint {
  const selectedPreset = preset || 'windows_chrome_standard';
  const base = FINGERPRINT_PRESETS[selectedPreset] || FINGERPRINT_PRESETS['windows_chrome_standard'];

  // Generate unique but consistent noise seeds for this session
  const sessionSeed = Math.random();
  
  return {
    ...base,
    canvasNoiseSeed: base.canvasNoiseSeed + (sessionSeed * 0.0001),
    audioNoiseSeed: base.audioNoiseSeed + (sessionSeed * 0.00000001),
  };
}

/**
 * Get random fingerprint preset name weighted by real-world usage
 */
export function getRandomPreset(): string {
  const presets = Object.keys(FINGERPRINT_PRESETS);
  // Windows is most common (~75%), then Mac (~15%), then Linux (~10%)
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

/**
 * Generate the fingerprint injection script for CDP
 */
export function getFingerprintScript(fp: Fingerprint): string {
  return `
    (function() {
      // ========== HARDWARE ==========
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => ${fp.hardwareConcurrency} });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => ${fp.deviceMemory} });
      Object.defineProperty(navigator, 'platform', { get: () => '${fp.platform}' });
      
      // ========== SCREEN - Must match viewport exactly ==========
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
      
      // Also override window.screen references
      Object.defineProperty(window, 'devicePixelRatio', { get: () => ${fp.screen.pixelRatio} });
      Object.defineProperty(window, 'innerWidth', { get: () => ${fp.screen.width}, configurable: true });
      Object.defineProperty(window, 'innerHeight', { get: () => ${fp.screen.height}, configurable: true });
      Object.defineProperty(window, 'outerWidth', { get: () => ${fp.screen.width}, configurable: true });
      Object.defineProperty(window, 'outerHeight', { get: () => ${fp.screen.height}, configurable: true });
      
      // ========== WEBGL FINGERPRINT ==========
      const getParameterProxyHandler = {
        apply: function(target, thisArg, args) {
          const param = args[0];
          // UNMASKED_VENDOR_WEBGL
          if (param === 37445) return '${fp.webgl.unmaskedVendor}';
          // UNMASKED_RENDERER_WEBGL
          if (param === 37446) return '${fp.webgl.unmaskedRenderer}';
          // VENDOR
          if (param === 7936) return '${fp.webgl.vendor}';
          // RENDERER
          if (param === 7937) return '${fp.webgl.renderer}';
          return Reflect.apply(target, thisArg, args);
        }
      };
      
      // Proxy both WebGL and WebGL2
      ['WebGLRenderingContext', 'WebGL2RenderingContext'].forEach(ctx => {
        if (window[ctx]) {
          const original = window[ctx].prototype.getParameter;
          window[ctx].prototype.getParameter = new Proxy(original, getParameterProxyHandler);
        }
      });
      
      // ========== CANVAS FINGERPRINT NOISE ==========
      const noiseSeed = ${fp.canvasNoiseSeed};
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
        const context = this.getContext('2d');
        if (context && this.width > 0 && this.height > 0) {
          try {
            const imageData = context.getImageData(0, 0, Math.min(this.width, 10), Math.min(this.height, 10));
            for (let i = 0; i < imageData.data.length; i += 4) {
              // Add minimal noise that doesn't visibly affect the image
              imageData.data[i] = imageData.data[i] ^ (Math.floor(noiseSeed * 255) & 1);
            }
            context.putImageData(imageData, 0, 0);
          } catch(e) {}
        }
        return originalToDataURL.apply(this, arguments);
      };
      
      // ========== AUDIO FINGERPRINT ==========
      const audioNoise = ${fp.audioNoiseSeed};
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
      
      // ========== LANGUAGES ==========
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      Object.defineProperty(navigator, 'language', { get: () => 'en-US' });
      
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
      
      console.log('[Fingerprint] Applied consistent fingerprint profile');
    })();
  `;
}
