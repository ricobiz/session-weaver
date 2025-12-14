/**
 * Human-like Behavior Simulation
 * Makes automated actions appear more natural with micro-movements,
 * area-based clicking, natural scrolling, and realistic timing
 */

import { Page } from 'playwright';

export interface HumanBehaviorConfig {
  // Mouse movement
  mouseMovementEnabled: boolean;
  mouseMovementSpeed: 'slow' | 'normal' | 'fast';
  microJitterEnabled: boolean;
  jitterIntensity: number; // 0-1, how much micro-movement

  // Clicking
  clickAreaRadius: number; // pixels - click within this area randomly
  doubleClickChance: number; // 0-1

  // Typing
  typingSpeed: 'slow' | 'normal' | 'fast';
  typingMistakes: boolean;

  // Scrolling
  smoothScrolling: boolean;
  scrollPauses: boolean;
  scrollVariance: number; // 0-1

  // General
  randomDelays: boolean;
  minDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_CONFIG: HumanBehaviorConfig = {
  mouseMovementEnabled: true,
  mouseMovementSpeed: 'normal',
  microJitterEnabled: true,
  jitterIntensity: 0.3,
  clickAreaRadius: 5, // 5px radius = 10px diameter click area
  doubleClickChance: 0,
  typingSpeed: 'normal',
  typingMistakes: false,
  smoothScrolling: true,
  scrollPauses: true,
  scrollVariance: 0.3,
  randomDelays: true,
  minDelayMs: 50,
  maxDelayMs: 200,
};

// Track current mouse position
let currentMouseX = 500;
let currentMouseY = 400;

/**
 * Get random point within a circular area (for natural click variation)
 */
function getRandomPointInArea(centerX: number, centerY: number, radius: number): { x: number; y: number } {
  // Use polar coordinates for uniform distribution in circle
  const angle = Math.random() * 2 * Math.PI;
  const r = Math.sqrt(Math.random()) * radius; // sqrt for uniform distribution
  return {
    x: centerX + r * Math.cos(angle),
    y: centerY + r * Math.sin(angle),
  };
}

/**
 * Generate micro-jitter offset (simulates hand tremor)
 */
function getMicroJitter(intensity: number): { dx: number; dy: number } {
  const maxJitter = 2 * intensity; // Max 2px at full intensity
  return {
    dx: (Math.random() - 0.5) * 2 * maxJitter,
    dy: (Math.random() - 0.5) * 2 * maxJitter,
  };
}

/**
 * Human-like mouse movement using Bezier curves with micro-jitter
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
    currentMouseX = targetX;
    currentMouseY = targetY;
    return;
  }

  const startX = currentMouseX;
  const startY = currentMouseY;

  // Generate bezier curve points for natural movement
  const points = generateBezierPath(startX, startY, targetX, targetY, cfg.mouseMovementSpeed);

  // Move through points with optional micro-jitter
  for (let i = 0; i < points.length; i++) {
    let { x, y } = points[i];

    // Add micro-jitter (not on final point)
    if (cfg.microJitterEnabled && i < points.length - 1) {
      const jitter = getMicroJitter(cfg.jitterIntensity);
      x += jitter.dx;
      y += jitter.dy;
    }

    await page.mouse.move(x, y);
    currentMouseX = x;
    currentMouseY = y;

    if (cfg.randomDelays) {
      await randomDelay(3, 12);
    }
  }

  // Final move to exact target (no jitter)
  await page.mouse.move(targetX, targetY);
  currentMouseX = targetX;
  currentMouseY = targetY;
}

/**
 * Human-like clicking within an area (not exact point)
 */
export async function humanClick(
  page: Page,
  x: number,
  y: number,
  config: Partial<HumanBehaviorConfig> = {}
): Promise<void> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Get random point within click area
  const clickPoint = getRandomPointInArea(x, y, cfg.clickAreaRadius);

  // Move to target first with natural path
  await humanMouseMove(page, clickPoint.x, clickPoint.y, config);

  // Small pause before click (humans don't click instantly)
  if (cfg.randomDelays) {
    await randomDelay(30, 120);
  }

  // Occasional slight movement before click (hesitation)
  if (Math.random() < 0.15) {
    const hesitation = getMicroJitter(1);
    await page.mouse.move(clickPoint.x + hesitation.dx, clickPoint.y + hesitation.dy);
    await randomDelay(20, 60);
    await page.mouse.move(clickPoint.x, clickPoint.y);
  }

  await page.mouse.click(clickPoint.x, clickPoint.y);

  // Small pause after click
  if (cfg.randomDelays) {
    await randomDelay(80, 250);
  }
}

/**
 * Human-like double click
 */
export async function humanDoubleClick(
  page: Page,
  x: number,
  y: number,
  config: Partial<HumanBehaviorConfig> = {}
): Promise<void> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const clickPoint = getRandomPointInArea(x, y, cfg.clickAreaRadius);

  await humanMouseMove(page, clickPoint.x, clickPoint.y, config);

  if (cfg.randomDelays) {
    await randomDelay(30, 80);
  }

  await page.mouse.dblclick(clickPoint.x, clickPoint.y);

  if (cfg.randomDelays) {
    await randomDelay(100, 300);
  }
}

/**
 * Human-like drag and drop within areas
 */
export async function humanDrag(
  page: Page,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  config: Partial<HumanBehaviorConfig> = {}
): Promise<void> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Get random points within areas
  const startPoint = getRandomPointInArea(fromX, fromY, cfg.clickAreaRadius);
  const endPoint = getRandomPointInArea(toX, toY, cfg.clickAreaRadius);

  // Move to start position
  await humanMouseMove(page, startPoint.x, startPoint.y, config);

  // Pause before starting drag
  await randomDelay(50, 150);

  // Mouse down
  await page.mouse.down();

  // Small pause after grabbing
  await randomDelay(30, 80);

  // Generate drag path (slower than regular movement)
  const dragConfig = { ...config, mouseMovementSpeed: 'slow' as const };
  const points = generateBezierPath(startPoint.x, startPoint.y, endPoint.x, endPoint.y, 'slow');

  // Move through drag path with micro-jitter
  for (let i = 0; i < points.length; i++) {
    let { x, y } = points[i];

    if (cfg.microJitterEnabled) {
      const jitter = getMicroJitter(cfg.jitterIntensity * 0.5); // Less jitter when dragging
      x += jitter.dx;
      y += jitter.dy;
    }

    await page.mouse.move(x, y);
    currentMouseX = x;
    currentMouseY = y;

    await randomDelay(8, 20);
  }

  // Final position
  await page.mouse.move(endPoint.x, endPoint.y);

  // Pause before release
  await randomDelay(30, 100);

  // Mouse up
  await page.mouse.up();

  // Pause after drop
  await randomDelay(80, 200);
}

/**
 * Human-like typing with realistic speed and pauses
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

    // Variable delay between keystrokes (Gaussian-like distribution)
    const variance = (Math.random() + Math.random() + Math.random()) / 3 - 0.5;
    const delay = baseDelay + variance * baseDelay * 0.8;
    await new Promise(resolve => setTimeout(resolve, Math.max(20, delay)));

    // Occasional longer pauses (thinking, looking at keyboard)
    if (Math.random() < 0.03) {
      await randomDelay(300, 800);
    }
    // Shorter pause after space (natural rhythm)
    else if (char === ' ' && Math.random() < 0.2) {
      await randomDelay(100, 250);
    }
  }
}

/**
 * Human-like scrolling with natural acceleration/deceleration
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

  // Add variance to total distance
  const actualDistance = distance * (1 + (Math.random() - 0.5) * cfg.scrollVariance);

  // Break scroll into variable steps (simulate inertial scrolling)
  const numSteps = Math.ceil(actualDistance / 80) + Math.floor(Math.random() * 5);
  const steps: number[] = [];

  // Generate step sizes with ease-in-out pattern
  for (let i = 0; i < numSteps; i++) {
    const progress = i / numSteps;
    // Ease-in-out curve: faster in middle, slower at start/end
    const easeMultiplier = Math.sin(progress * Math.PI);
    const baseStep = actualDistance / numSteps;
    steps.push(baseStep * (0.5 + easeMultiplier * 0.8));
  }

  // Normalize steps to match actual distance
  const totalSteps = steps.reduce((a, b) => a + b, 0);
  const normalizer = actualDistance / totalSteps;

  for (let i = 0; i < steps.length; i++) {
    const stepDistance = steps[i] * normalizer;
    const delta = direction === 'down' ? stepDistance : -stepDistance;

    // Add slight randomness to each scroll step
    const randomDelta = delta * (0.9 + Math.random() * 0.2);
    await page.mouse.wheel(0, randomDelta);

    // Variable pause between scroll steps (faster in middle)
    if (i < steps.length - 1) {
      const progress = i / steps.length;
      const pauseMultiplier = 1 - Math.sin(progress * Math.PI) * 0.6;
      await randomDelay(15 * pauseMultiplier, 50 * pauseMultiplier);
    }
  }

  // Occasional pause after scrolling (reading content)
  if (cfg.scrollPauses && Math.random() < 0.25) {
    await randomDelay(400, 1200);
  }
}

/**
 * Keyboard navigation (arrow keys, page up/down, home/end)
 */
export async function humanKeyboardNav(
  page: Page,
  key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'PageUp' | 'PageDown' | 'Home' | 'End',
  config: Partial<HumanBehaviorConfig> = {}
): Promise<void> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Small pause before key press
  if (cfg.randomDelays) {
    await randomDelay(30, 100);
  }

  await page.keyboard.press(key);

  // Pause after navigation
  if (cfg.randomDelays) {
    await randomDelay(50, 200);
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
  const variance = durationMs * 0.2;
  const actualDuration = durationMs + (Math.random() - 0.5) * 2 * variance;
  await new Promise(resolve => setTimeout(resolve, Math.max(0, actualDuration)));
}

/**
 * Idle mouse micro-movements (when waiting)
 */
export async function idleMouseMovement(
  page: Page,
  durationMs: number,
  config: Partial<HumanBehaviorConfig> = {}
): Promise<void> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();

  while (Date.now() - startTime < durationMs) {
    // Small random movement
    const jitter = getMicroJitter(cfg.jitterIntensity * 2);
    const newX = currentMouseX + jitter.dx * 3;
    const newY = currentMouseY + jitter.dy * 3;

    await page.mouse.move(newX, newY);
    currentMouseX = newX;
    currentMouseY = newY;

    // Wait before next micro-movement
    await randomDelay(200, 800);
  }
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
  const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));

  // More points for longer distances
  const basePoints = speed === 'slow' ? 35 : speed === 'fast' ? 12 : 22;
  const numPoints = Math.max(8, Math.min(50, Math.floor(basePoints * (distance / 500))));

  // Control points with natural curve variation
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;

  // Add slight overshoot tendency (humans often overshoot slightly)
  const overshoot = 0.05 + Math.random() * 0.1;

  // Control points create a natural S-curve or arc
  const curvature = (Math.random() - 0.5) * 150;
  const cp1x = startX + (endX - startX) * 0.25 + curvature * (Math.random() - 0.5);
  const cp1y = startY + (endY - startY) * 0.1 + curvature;
  const cp2x = startX + (endX - startX) * 0.75 + curvature * (Math.random() - 0.5);
  const cp2y = startY + (endY - startY) * 0.9 - curvature * 0.5;

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;

    // Add slight ease-in-out for more natural acceleration
    const easedT = t < 0.5
      ? 2 * t * t
      : 1 - Math.pow(-2 * t + 2, 2) / 2;

    const x = cubicBezier(startX, cp1x, cp2x, endX + (endX - startX) * overshoot, easedT);
    const y = cubicBezier(startY, cp1y, cp2y, endY + (endY - startY) * overshoot, easedT);
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
    case 'slow': return 180;
    case 'fast': return 60;
    default: return 100;
  }
}

function getAdjacentKey(key: string): string | null {
  const keyboard: Record<string, string[]> = {
    'a': ['s', 'q', 'z', 'w'],
    'b': ['v', 'n', 'g', 'h'],
    'c': ['x', 'v', 'd', 'f'],
    'd': ['s', 'f', 'e', 'c', 'r'],
    'e': ['w', 'r', 'd', 's'],
    'f': ['d', 'g', 'r', 'v', 't'],
    'g': ['f', 'h', 't', 'b', 'y'],
    'h': ['g', 'j', 'y', 'n', 'u'],
    'i': ['u', 'o', 'k', 'j'],
    'j': ['h', 'k', 'u', 'm', 'i'],
    'k': ['j', 'l', 'i', 'o'],
    'l': ['k', 'o', 'p'],
    'm': ['n', 'j', 'k'],
    'n': ['b', 'm', 'h', 'j'],
    'o': ['i', 'p', 'l', 'k'],
    'p': ['o', 'l'],
    'q': ['w', 'a', 's'],
    'r': ['e', 't', 'f', 'd'],
    's': ['a', 'd', 'w', 'x', 'e'],
    't': ['r', 'y', 'g', 'f'],
    'u': ['y', 'i', 'j', 'h'],
    'v': ['c', 'b', 'f', 'g'],
    'w': ['q', 'e', 's', 'a'],
    'x': ['z', 'c', 's', 'd'],
    'y': ['t', 'u', 'h', 'g'],
    'z': ['a', 'x', 's'],
  };

  const lower = key.toLowerCase();
  const adjacent = keyboard[lower];

  if (!adjacent || adjacent.length === 0) return null;

  const wrongKey = adjacent[Math.floor(Math.random() * adjacent.length)];
  return key === key.toUpperCase() ? wrongKey.toUpperCase() : wrongKey;
}

export { DEFAULT_CONFIG };
