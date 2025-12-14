/**
 * Human-like Behavior Simulation
 * Makes automated actions appear more natural
 */

import { Page } from 'playwright';
import { log } from '../logger';

export interface HumanBehaviorConfig {
  // Mouse movement
  mouseMovementEnabled: boolean;
  mouseMovementSpeed: 'slow' | 'normal' | 'fast';

  // Typing
  typingSpeed: 'slow' | 'normal' | 'fast';
  typingMistakes: boolean;

  // Scrolling
  smoothScrolling: boolean;
  scrollPauses: boolean;

  // General
  randomDelays: boolean;
  minDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_CONFIG: HumanBehaviorConfig = {
  mouseMovementEnabled: true,
  mouseMovementSpeed: 'normal',
  typingSpeed: 'normal',
  typingMistakes: false, // Disabled by default - can cause issues
  smoothScrolling: true,
  scrollPauses: true,
  randomDelays: true,
  minDelayMs: 50,
  maxDelayMs: 200,
};

/**
 * Human-like mouse movement using Bezier curves
 */
export async function humanMouseMove(
  page: Page,
  targetX: number,
  targetY: number,
  config: Partial<HumanBehaviorConfig> = {}
): Promise<void> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (!cfg.mouseMovementEnabled) {
    await page.mouse.move(targetX, targetY);
    return;
  }

  // Get current mouse position (approximate from viewport center if unknown)
  const viewport = page.viewportSize();
  const startX = viewport ? viewport.width / 2 : 500;
  const startY = viewport ? viewport.height / 2 : 400;

  // Generate bezier curve points for natural movement
  const points = generateBezierPath(startX, startY, targetX, targetY, cfg.mouseMovementSpeed);

  // Move through points
  for (const point of points) {
    await page.mouse.move(point.x, point.y);
    
    if (cfg.randomDelays) {
      await randomDelay(5, 15);
    }
  }

  // Final move to exact target
  await page.mouse.move(targetX, targetY);
}

/**
 * Human-like clicking with pre-movement
 */
export async function humanClick(
  page: Page,
  x: number,
  y: number,
  config: Partial<HumanBehaviorConfig> = {}
): Promise<void> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Move to target first
  await humanMouseMove(page, x, y, config);

  // Small pause before click (humans don't click instantly)
  if (cfg.randomDelays) {
    await randomDelay(50, 150);
  }

  // Click with slight position variance
  const variance = 2;
  const clickX = x + (Math.random() - 0.5) * variance;
  const clickY = y + (Math.random() - 0.5) * variance;

  await page.mouse.click(clickX, clickY);

  // Small pause after click
  if (cfg.randomDelays) {
    await randomDelay(100, 300);
  }
}

/**
 * Human-like typing with realistic speed and optional mistakes
 */
export async function humanType(
  page: Page,
  text: string,
  config: Partial<HumanBehaviorConfig> = {}
): Promise<void> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const baseDelay = getTypingDelay(cfg.typingSpeed);

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    // Simulate typing mistake (rare)
    if (cfg.typingMistakes && Math.random() < 0.02) {
      // Type wrong character
      const wrongChar = getAdjacentKey(char);
      if (wrongChar) {
        await page.keyboard.press(wrongChar);
        await randomDelay(100, 200);
        await page.keyboard.press('Backspace');
        await randomDelay(50, 100);
      }
    }

    // Type the character
    await page.keyboard.type(char, { delay: 0 });

    // Variable delay between keystrokes
    const delay = baseDelay + (Math.random() - 0.5) * baseDelay * 0.5;
    await new Promise(resolve => setTimeout(resolve, delay));

    // Occasional longer pauses (thinking)
    if (Math.random() < 0.05) {
      await randomDelay(200, 500);
    }
  }
}

/**
 * Human-like scrolling
 */
export async function humanScroll(
  page: Page,
  direction: 'up' | 'down',
  distance: number,
  config: Partial<HumanBehaviorConfig> = {}
): Promise<void> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (!cfg.smoothScrolling) {
    const delta = direction === 'down' ? distance : -distance;
    await page.mouse.wheel(0, delta);
    return;
  }

  // Break scroll into smaller steps
  const steps = Math.ceil(distance / 100);
  const stepDistance = distance / steps;

  for (let i = 0; i < steps; i++) {
    const delta = direction === 'down' ? stepDistance : -stepDistance;
    
    // Add slight randomness to each scroll step
    const randomDelta = delta * (0.8 + Math.random() * 0.4);
    await page.mouse.wheel(0, randomDelta);

    // Pause between scroll steps
    if (cfg.scrollPauses && i < steps - 1) {
      await randomDelay(30, 80);
    }
  }

  // Occasional pause after scrolling (reading)
  if (cfg.scrollPauses && Math.random() < 0.3) {
    await randomDelay(500, 1500);
  }
}

/**
 * Random delay between actions
 */
export async function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Human-like wait that simulates reading or thinking
 */
export async function humanWait(durationMs: number): Promise<void> {
  // Add variance (±20%)
  const variance = durationMs * 0.2;
  const actualDuration = durationMs + (Math.random() - 0.5) * 2 * variance;
  await new Promise(resolve => setTimeout(resolve, Math.max(0, actualDuration)));
}

// --- Helper Functions ---

function generateBezierPath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  speed: 'slow' | 'normal' | 'fast'
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];

  // Number of points based on speed
  const numPoints = speed === 'slow' ? 30 : speed === 'fast' ? 10 : 20;

  // Control points for bezier curve (add randomness)
  const cp1x = startX + (endX - startX) * 0.3 + (Math.random() - 0.5) * 100;
  const cp1y = startY + (endY - startY) * 0.1 + (Math.random() - 0.5) * 100;
  const cp2x = startX + (endX - startX) * 0.7 + (Math.random() - 0.5) * 100;
  const cp2y = startY + (endY - startY) * 0.9 + (Math.random() - 0.5) * 100;

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const x = cubicBezier(startX, cp1x, cp2x, endX, t);
    const y = cubicBezier(startY, cp1y, cp2y, endY, t);
    points.push({ x, y });
  }

  return points;
}

function cubicBezier(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const oneMinusT = 1 - t;
  return (
    Math.pow(oneMinusT, 3) * p0 +
    3 * Math.pow(oneMinusT, 2) * t * p1 +
    3 * oneMinusT * Math.pow(t, 2) * p2 +
    Math.pow(t, 3) * p3
  );
}

function getTypingDelay(speed: 'slow' | 'normal' | 'fast'): number {
  switch (speed) {
    case 'slow': return 150;
    case 'fast': return 50;
    default: return 80;
  }
}

function getAdjacentKey(key: string): string | null {
  const keyboard: Record<string, string[]> = {
    'a': ['s', 'q', 'z'],
    'b': ['v', 'n', 'g'],
    'c': ['x', 'v', 'd'],
    'd': ['s', 'f', 'e', 'c'],
    'e': ['w', 'r', 'd'],
    'f': ['d', 'g', 'r', 'v'],
    'g': ['f', 'h', 't', 'b'],
    'h': ['g', 'j', 'y', 'n'],
    'i': ['u', 'o', 'k'],
    'j': ['h', 'k', 'u', 'm'],
    'k': ['j', 'l', 'i'],
    'l': ['k', 'o', 'p'],
    'm': ['n', 'j', 'k'],
    'n': ['b', 'm', 'h'],
    'o': ['i', 'p', 'l'],
    'p': ['o', 'l'],
    'q': ['w', 'a'],
    'r': ['e', 't', 'f'],
    's': ['a', 'd', 'w', 'x'],
    't': ['r', 'y', 'g'],
    'u': ['y', 'i', 'j'],
    'v': ['c', 'b', 'f'],
    'w': ['q', 'e', 's'],
    'x': ['z', 'c', 's'],
    'y': ['t', 'u', 'h'],
    'z': ['a', 'x'],
  };

  const lower = key.toLowerCase();
  const adjacent = keyboard[lower];
  
  if (!adjacent || adjacent.length === 0) return null;
  
  const wrongKey = adjacent[Math.floor(Math.random() * adjacent.length)];
  return key === key.toUpperCase() ? wrongKey.toUpperCase() : wrongKey;
}
