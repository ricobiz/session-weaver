/**
 * Browser Fingerprint Configuration
 * Used to spoof various browser fingerprinting vectors
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
  };

  // Screen
  screen: {
    width: number;
    height: number;
    colorDepth: number;
    pixelRatio: number;
  };
}

// Realistic fingerprint presets
export const FINGERPRINT_PRESETS: Record<string, Fingerprint> = {
  // Windows Chrome on mid-range PC
  'windows_chrome_mid': {
    hardwareConcurrency: 8,
    deviceMemory: 8,
    platform: 'Win32',
    webgl: {
      vendor: 'Google Inc. (Intel)',
      renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0)',
    },
    screen: { width: 1920, height: 1080, colorDepth: 24, pixelRatio: 1 },
  },

  // Windows Chrome on high-end PC
  'windows_chrome_high': {
    hardwareConcurrency: 16,
    deviceMemory: 16,
    platform: 'Win32',
    webgl: {
      vendor: 'Google Inc. (NVIDIA)',
      renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0)',
    },
    screen: { width: 2560, height: 1440, colorDepth: 24, pixelRatio: 1 },
  },

  // Windows Chrome on low-end PC
  'windows_chrome_low': {
    hardwareConcurrency: 4,
    deviceMemory: 4,
    platform: 'Win32',
    webgl: {
      vendor: 'Google Inc. (Intel)',
      renderer: 'ANGLE (Intel, Intel(R) HD Graphics 620 Direct3D11 vs_5_0 ps_5_0)',
    },
    screen: { width: 1366, height: 768, colorDepth: 24, pixelRatio: 1 },
  },

  // MacOS Chrome
  'macos_chrome': {
    hardwareConcurrency: 8,
    deviceMemory: 8,
    platform: 'MacIntel',
    webgl: {
      vendor: 'Google Inc. (Apple)',
      renderer: 'ANGLE (Apple, Apple M1 Pro, OpenGL 4.1)',
    },
    screen: { width: 2560, height: 1600, colorDepth: 30, pixelRatio: 2 },
  },

  // Linux Chrome
  'linux_chrome': {
    hardwareConcurrency: 8,
    deviceMemory: 8,
    platform: 'Linux x86_64',
    webgl: {
      vendor: 'Google Inc. (Intel)',
      renderer: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 630, OpenGL 4.6)',
    },
    screen: { width: 1920, height: 1080, colorDepth: 24, pixelRatio: 1 },
  },
};

/**
 * Generate a randomized fingerprint based on a preset with slight variations
 */
export function generateFingerprint(preset?: string): Fingerprint {
  const base = FINGERPRINT_PRESETS[preset || 'windows_chrome_mid'];

  return {
    ...base,
    // Add slight randomization to make each fingerprint unique
    hardwareConcurrency: base.hardwareConcurrency,
    deviceMemory: base.deviceMemory,
    screen: {
      ...base.screen,
    },
  };
}

/**
 * Get random fingerprint preset name
 */
export function getRandomPreset(): string {
  const presets = Object.keys(FINGERPRINT_PRESETS);
  // Weight towards Windows as it's most common
  const weights = [0.4, 0.2, 0.15, 0.15, 0.1];
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
