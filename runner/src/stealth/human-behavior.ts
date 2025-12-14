/**
 * Advanced Human-like Behavior Simulation
 * Implements randomized speeds, varied trajectories, and natural patterns
 * to bypass bot detection systems
 */

import { Page } from 'playwright';

export interface HumanBehaviorConfig {
  // Mouse movement
  mouseMovementEnabled: boolean;
  speedVariation: 'low' | 'medium' | 'high'; // How much speed varies
  trajectoryStyle: 'random' | 'bezier' | 'arc' | 'wave' | 'natural';
  microJitterEnabled: boolean;
  jitterIntensity: number; // 0-1
  overshootEnabled: boolean;
  overshootIntensity: number; // 0-1

  // Clicking
  clickAreaRadius: number;
  preClickHesitation: boolean;

  // Typing
  typingSpeed: 'slow' | 'normal' | 'fast';
  typingMistakes: boolean;
  typingBursts: boolean; // Type in bursts like humans

  // Scrolling
  smoothScrolling: boolean;
  scrollVariance: number;
  inertialScrolling: boolean;

  // General
  randomDelays: boolean;
  thinkingPauses: boolean;
}

const DEFAULT_CONFIG: HumanBehaviorConfig = {
  mouseMovementEnabled: true,
  speedVariation: 'high',
  trajectoryStyle: 'natural',
  microJitterEnabled: true,
  jitterIntensity: 0.4,
  overshootEnabled: true,
  overshootIntensity: 0.15,
  clickAreaRadius: 6,
  preClickHesitation: true,
  typingSpeed: 'normal',
  typingMistakes: false,
  typingBursts: true,
  smoothScrolling: true,
  scrollVariance: 0.35,
  inertialScrolling: true,
  randomDelays: true,
  thinkingPauses: true,
};

// Track current mouse position
let currentMouseX = 960;
let currentMouseY = 540;

// ==================== TRAJECTORY GENERATORS ====================

type TrajectoryType = 'bezier' | 'arc' | 'wave' | 'sigmoid' | 'erratic' | 'direct';

/**
 * Select random trajectory type based on distance and context
 */
function selectTrajectoryType(distance: number): TrajectoryType {
  const rand = Math.random();
  
  if (distance < 100) {
    // Short distances: more direct or slight curves
    if (rand < 0.4) return 'direct';
    if (rand < 0.7) return 'bezier';
    return 'arc';
  } else if (distance < 400) {
    // Medium distances: variety of curves
    if (rand < 0.25) return 'bezier';
    if (rand < 0.5) return 'arc';
    if (rand < 0.7) return 'wave';
    if (rand < 0.85) return 'sigmoid';
    return 'erratic';
  } else {
    // Long distances: more complex paths
    if (rand < 0.3) return 'bezier';
    if (rand < 0.5) return 'sigmoid';
    if (rand < 0.7) return 'wave';
    if (rand < 0.85) return 'erratic';
    return 'arc';
  }
}

/**
 * Generate random speed multiplier for this movement
 */
function getRandomSpeedMultiplier(variation: 'low' | 'medium' | 'high'): number {
  const ranges = {
    low: { min: 0.85, max: 1.15 },
    medium: { min: 0.6, max: 1.5 },
    high: { min: 0.3, max: 2.2 },
  };
  const range = ranges[variation];
  return range.min + Math.random() * (range.max - range.min);
}

/**
 * Get number of points based on distance and speed
 */
function getPointCount(distance: number, speedMultiplier: number): number {
  const basePoints = Math.max(10, Math.min(80, Math.floor(distance / 8)));
  return Math.floor(basePoints / speedMultiplier);
}

/**
 * Generate Bezier curve path (classic smooth movement)
 */
function generateBezierPath(
  startX: number, startY: number,
  endX: number, endY: number,
  numPoints: number
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  
  // Random control points with varied curvature
  const curvature = (Math.random() - 0.5) * 200 * (Math.random() + 0.5);
  const asymmetry = Math.random() * 0.4 + 0.3; // 0.3-0.7
  
  const cp1x = startX + (endX - startX) * asymmetry + curvature * (Math.random() - 0.3);
  const cp1y = startY + (endY - startY) * 0.2 + curvature;
  const cp2x = startX + (endX - startX) * (1 - asymmetry) + curvature * (Math.random() - 0.5);
  const cp2y = startY + (endY - startY) * 0.8 - curvature * 0.5;
  
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const oneMinusT = 1 - t;
    
    const x = Math.pow(oneMinusT, 3) * startX +
              3 * Math.pow(oneMinusT, 2) * t * cp1x +
              3 * oneMinusT * Math.pow(t, 2) * cp2x +
              Math.pow(t, 3) * endX;
    
    const y = Math.pow(oneMinusT, 3) * startY +
              3 * Math.pow(oneMinusT, 2) * t * cp1y +
              3 * oneMinusT * Math.pow(t, 2) * cp2y +
              Math.pow(t, 3) * endY;
    
    points.push({ x, y });
  }
  
  return points;
}

/**
 * Generate arc/semicircle path
 */
function generateArcPath(
  startX: number, startY: number,
  endX: number, endY: number,
  numPoints: number
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;
  const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
  
  // Random arc height (positive or negative)
  const arcHeight = (Math.random() - 0.5) * distance * 0.6;
  
  // Perpendicular direction
  const dx = endX - startX;
  const dy = endY - startY;
  const perpX = -dy / distance;
  const perpY = dx / distance;
  
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    
    // Arc factor (peaks at t=0.5)
    const arcFactor = Math.sin(t * Math.PI);
    
    const x = startX + (endX - startX) * t + perpX * arcHeight * arcFactor;
    const y = startY + (endY - startY) * t + perpY * arcHeight * arcFactor;
    
    points.push({ x, y });
  }
  
  return points;
}

/**
 * Generate wave/sine path
 */
function generateWavePath(
  startX: number, startY: number,
  endX: number, endY: number,
  numPoints: number
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  
  const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
  const waveFrequency = 1 + Math.random() * 2; // 1-3 waves
  const waveAmplitude = distance * (0.05 + Math.random() * 0.1);
  
  const dx = endX - startX;
  const dy = endY - startY;
  const perpX = -dy / distance;
  const perpY = dx / distance;
  
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    
    // Damped sine wave (smaller at start and end)
    const envelope = Math.sin(t * Math.PI);
    const wave = Math.sin(t * Math.PI * 2 * waveFrequency) * envelope;
    
    const x = startX + dx * t + perpX * waveAmplitude * wave;
    const y = startY + dy * t + perpY * waveAmplitude * wave;
    
    points.push({ x, y });
  }
  
  return points;
}

/**
 * Generate sigmoid/S-curve path
 */
function generateSigmoidPath(
  startX: number, startY: number,
  endX: number, endY: number,
  numPoints: number
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  
  // Sigmoid steepness (higher = sharper S)
  const steepness = 4 + Math.random() * 4; // 4-8
  
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    
    // Sigmoid function for smooth S-curve
    const sigmoid = 1 / (1 + Math.exp(-steepness * (t - 0.5)));
    
    const x = startX + (endX - startX) * sigmoid;
    const y = startY + (endY - startY) * t; // Linear Y, sigmoid X creates S
    
    points.push({ x, y });
  }
  
  return points;
}

/**
 * Generate erratic/nervous path (for hesitant movements)
 */
function generateErraticPath(
  startX: number, startY: number,
  endX: number, endY: number,
  numPoints: number
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  
  const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
  const erraticness = distance * 0.08;
  
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    
    // More erratic in the middle, smoother at ends
    const erraticFactor = Math.sin(t * Math.PI) * (0.5 + Math.random() * 0.5);
    
    const x = startX + (endX - startX) * t + (Math.random() - 0.5) * erraticness * erraticFactor;
    const y = startY + (endY - startY) * t + (Math.random() - 0.5) * erraticness * erraticFactor;
    
    points.push({ x, y });
  }
  
  return points;
}

/**
 * Generate direct path with slight deviation
 */
function generateDirectPath(
  startX: number, startY: number,
  endX: number, endY: number,
  numPoints: number
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  
  // Slight curve deviation
  const deviation = (Math.random() - 0.5) * 20;
  
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const curve = Math.sin(t * Math.PI) * deviation;
    
    const x = startX + (endX - startX) * t + curve * 0.3;
    const y = startY + (endY - startY) * t + curve * 0.7;
    
    points.push({ x, y });
  }
  
  return points;
}

/**
 * Generate path based on trajectory type
 */
function generatePath(
  startX: number, startY: number,
  endX: number, endY: number,
  trajectoryType: TrajectoryType,
  numPoints: number
): Array<{ x: number; y: number }> {
  switch (trajectoryType) {
    case 'bezier': return generateBezierPath(startX, startY, endX, endY, numPoints);
    case 'arc': return generateArcPath(startX, startY, endX, endY, numPoints);
    case 'wave': return generateWavePath(startX, startY, endX, endY, numPoints);
    case 'sigmoid': return generateSigmoidPath(startX, startY, endX, endY, numPoints);
    case 'erratic': return generateErraticPath(startX, startY, endX, endY, numPoints);
    case 'direct': return generateDirectPath(startX, startY, endX, endY, numPoints);
    default: return generateBezierPath(startX, startY, endX, endY, numPoints);
  }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Get random point within circular area
 */
function getRandomPointInArea(centerX: number, centerY: number, radius: number): { x: number; y: number } {
  const angle = Math.random() * 2 * Math.PI;
  const r = Math.sqrt(Math.random()) * radius;
  return {
    x: centerX + r * Math.cos(angle),
    y: centerY + r * Math.sin(angle),
  };
}

/**
 * Generate micro-jitter (hand tremor simulation)
 */
function getMicroJitter(intensity: number): { dx: number; dy: number } {
  // Use Gaussian-like distribution for more natural jitter
  const gaussian = () => (Math.random() + Math.random() + Math.random()) / 3 - 0.5;
  const maxJitter = 3 * intensity;
  return {
    dx: gaussian() * maxJitter,
    dy: gaussian() * maxJitter,
  };
}

/**
 * Apply easing function for natural acceleration/deceleration
 */
function applyEasing(t: number, type: 'easeInOut' | 'easeOut' | 'easeIn' | 'linear'): number {
  switch (type) {
    case 'easeInOut':
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case 'easeOut':
      return 1 - Math.pow(1 - t, 3);
    case 'easeIn':
      return t * t * t;
    case 'linear':
    default:
      return t;
  }
}

/**
 * Random delay with Gaussian-like distribution
 */
export async function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const gaussian = (Math.random() + Math.random() + Math.random()) / 3;
  const delay = minMs + gaussian * (maxMs - minMs);
  await new Promise(resolve => setTimeout(resolve, Math.max(1, delay)));
}

// ==================== MAIN FUNCTIONS ====================

/**
 * Human-like mouse movement with random trajectories and speeds
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
  const distance = Math.sqrt(Math.pow(targetX - startX, 2) + Math.pow(targetY - startY, 2));

  if (distance < 5) {
    await page.mouse.move(targetX, targetY);
    currentMouseX = targetX;
    currentMouseY = targetY;
    return;
  }

  // Random speed for this movement
  const speedMultiplier = getRandomSpeedMultiplier(cfg.speedVariation);
  const numPoints = getPointCount(distance, speedMultiplier);

  // Random trajectory type
  const trajectoryType = cfg.trajectoryStyle === 'natural' 
    ? selectTrajectoryType(distance)
    : cfg.trajectoryStyle as TrajectoryType;

  // Calculate overshoot target
  let finalX = targetX;
  let finalY = targetY;
  if (cfg.overshootEnabled && Math.random() < 0.3) {
    const overshootAmount = distance * cfg.overshootIntensity * (0.5 + Math.random());
    const angle = Math.atan2(targetY - startY, targetX - startX);
    finalX = targetX + Math.cos(angle) * overshootAmount;
    finalY = targetY + Math.sin(angle) * overshootAmount;
  }

  // Generate path
  const points = generatePath(startX, startY, finalX, finalY, trajectoryType, numPoints);

  // Random easing type
  const easings: Array<'easeInOut' | 'easeOut' | 'easeIn' | 'linear'> = ['easeInOut', 'easeOut', 'easeIn'];
  const easing = easings[Math.floor(Math.random() * easings.length)];

  // Move through points with variable speed
  for (let i = 0; i < points.length; i++) {
    let { x, y } = points[i];
    const t = i / points.length;
    const easedT = applyEasing(t, easing);

    // Add micro-jitter (except near end)
    if (cfg.microJitterEnabled && i < points.length - 3) {
      const jitter = getMicroJitter(cfg.jitterIntensity);
      x += jitter.dx;
      y += jitter.dy;
    }

    await page.mouse.move(x, y);
    currentMouseX = x;
    currentMouseY = y;

    // Variable delay between points (slower at start/end, faster in middle)
    if (cfg.randomDelays) {
      const speedFactor = 1 - Math.sin(t * Math.PI) * 0.5; // Faster in middle
      const baseDelay = 3 + Math.random() * 8;
      await new Promise(resolve => setTimeout(resolve, baseDelay * speedFactor / speedMultiplier));
    }
  }

  // Correction movement if we overshot
  if (finalX !== targetX || finalY !== targetY) {
    await randomDelay(30, 80);
    const correctionPoints = generateDirectPath(currentMouseX, currentMouseY, targetX, targetY, 5);
    for (const point of correctionPoints) {
      await page.mouse.move(point.x, point.y);
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }

  // Final position
  await page.mouse.move(targetX, targetY);
  currentMouseX = targetX;
  currentMouseY = targetY;
}

/**
 * Human-like clicking with hesitation and area randomization
 */
export async function humanClick(
  page: Page,
  x: number,
  y: number,
  config: Partial<HumanBehaviorConfig> = {}
): Promise<void> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Random point within click area
  const clickPoint = getRandomPointInArea(x, y, cfg.clickAreaRadius);

  // Move to target
  await humanMouseMove(page, clickPoint.x, clickPoint.y, config);

  // Pre-click hesitation (sometimes users pause before clicking)
  if (cfg.preClickHesitation && Math.random() < 0.25) {
    await randomDelay(80, 250);
    // Small adjustment movement
    const adjustment = getMicroJitter(1.5);
    await page.mouse.move(clickPoint.x + adjustment.dx, clickPoint.y + adjustment.dy);
    await randomDelay(30, 80);
    await page.mouse.move(clickPoint.x, clickPoint.y);
  }

  // Small pause before click
  await randomDelay(20, 100);

  await page.mouse.click(clickPoint.x, clickPoint.y);

  // Post-click pause
  await randomDelay(80, 200);
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
  await randomDelay(20, 80);
  await page.mouse.dblclick(clickPoint.x, clickPoint.y);
  await randomDelay(100, 250);
}

/**
 * Human-like drag and drop
 */
export async function humanDrag(
  page: Page,
  fromX: number, fromY: number,
  toX: number, toY: number,
  config: Partial<HumanBehaviorConfig> = {}
): Promise<void> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const startPoint = getRandomPointInArea(fromX, fromY, cfg.clickAreaRadius);
  const endPoint = getRandomPointInArea(toX, toY, cfg.clickAreaRadius);

  // Move to start
  await humanMouseMove(page, startPoint.x, startPoint.y, config);
  await randomDelay(40, 120);

  // Mouse down
  await page.mouse.down();
  await randomDelay(30, 80);

  // Drag path (use slower, more deliberate movement)
  const distance = Math.sqrt(Math.pow(endPoint.x - startPoint.x, 2) + Math.pow(endPoint.y - startPoint.y, 2));
  const numPoints = Math.max(15, Math.floor(distance / 5));
  const trajectoryType = Math.random() < 0.5 ? 'bezier' : 'arc';
  
  const points = generatePath(startPoint.x, startPoint.y, endPoint.x, endPoint.y, trajectoryType, numPoints);

  for (let i = 0; i < points.length; i++) {
    let { x, y } = points[i];

    // Less jitter when dragging
    if (cfg.microJitterEnabled && i % 3 === 0) {
      const jitter = getMicroJitter(cfg.jitterIntensity * 0.3);
      x += jitter.dx;
      y += jitter.dy;
    }

    await page.mouse.move(x, y);
    currentMouseX = x;
    currentMouseY = y;
    await new Promise(resolve => setTimeout(resolve, 8 + Math.random() * 12));
  }

  await page.mouse.move(endPoint.x, endPoint.y);
  await randomDelay(30, 80);

  // Mouse up
  await page.mouse.up();
  await randomDelay(80, 180);
}

/**
 * Human-like typing with bursts and variable rhythm
 */
export async function humanType(
  page: Page,
  text: string,
  config: Partial<HumanBehaviorConfig> = {}
): Promise<void> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const baseDelay = cfg.typingSpeed === 'slow' ? 180 : cfg.typingSpeed === 'fast' ? 60 : 100;

  // Simulate typing in bursts (3-7 characters, then pause)
  let burstCounter = 0;
  const burstLength = 3 + Math.floor(Math.random() * 5);

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    // Typing mistakes (rare)
    if (cfg.typingMistakes && Math.random() < 0.015) {
      const wrongChar = getAdjacentKey(char);
      if (wrongChar) {
        await page.keyboard.type(wrongChar, { delay: 0 });
        await randomDelay(100, 200);
        await page.keyboard.press('Backspace');
        await randomDelay(40, 80);
      }
    }

    // Type character
    await page.keyboard.type(char, { delay: 0 });

    // Variable delay with Gaussian distribution
    const gaussian = (Math.random() + Math.random() + Math.random()) / 3;
    const variance = (gaussian - 0.5) * baseDelay * 0.7;
    const delay = Math.max(20, baseDelay + variance);
    
    await new Promise(resolve => setTimeout(resolve, delay));

    // Burst pause
    if (cfg.typingBursts) {
      burstCounter++;
      if (burstCounter >= burstLength) {
        await randomDelay(200, 600);
        burstCounter = 0;
      }
    }

    // Natural pause after space or punctuation
    if (char === ' ' && Math.random() < 0.15) {
      await randomDelay(80, 200);
    } else if ('.!?,;:'.includes(char) && Math.random() < 0.3) {
      await randomDelay(150, 400);
    }

    // Thinking pause (rare)
    if (cfg.thinkingPauses && Math.random() < 0.02) {
      await randomDelay(400, 1000);
    }
  }
}

/**
 * Human-like scrolling with inertia
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

  if (cfg.inertialScrolling) {
    // Simulate inertial scrolling (fast start, gradual slow down)
    const numSteps = 8 + Math.floor(Math.random() * 6);
    let remaining = actualDistance;

    for (let i = 0; i < numSteps; i++) {
      // Exponential decay for inertia
      const fraction = (numSteps - i) / numSteps;
      const stepDistance = remaining * (0.2 + fraction * 0.3);
      remaining -= stepDistance;

      const delta = direction === 'down' ? stepDistance : -stepDistance;
      const randomizedDelta = delta * (0.85 + Math.random() * 0.3);

      await page.mouse.wheel(0, randomizedDelta);
      
      // Delays increase as scroll slows
      const delay = 15 + (1 - fraction) * 40 + Math.random() * 20;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  } else {
    // Standard smooth scroll
    const numSteps = Math.ceil(actualDistance / 60);
    const stepDistance = actualDistance / numSteps;

    for (let i = 0; i < numSteps; i++) {
      const delta = direction === 'down' ? stepDistance : -stepDistance;
      const randomizedDelta = delta * (0.8 + Math.random() * 0.4);
      
      await page.mouse.wheel(0, randomizedDelta);
      await randomDelay(20, 60);
    }
  }

  // Reading pause after scroll
  if (Math.random() < 0.25) {
    await randomDelay(500, 1500);
  }
}

/**
 * Keyboard navigation
 */
export async function humanKeyboardNav(
  page: Page,
  key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'PageUp' | 'PageDown' | 'Home' | 'End',
  config: Partial<HumanBehaviorConfig> = {}
): Promise<void> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (cfg.randomDelays) {
    await randomDelay(25, 80);
  }

  await page.keyboard.press(key);

  if (cfg.randomDelays) {
    await randomDelay(40, 150);
  }
}

/**
 * Idle mouse micro-movements (when waiting/reading)
 */
export async function idleMouseMovement(
  page: Page,
  durationMs: number,
  config: Partial<HumanBehaviorConfig> = {}
): Promise<void> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();
  const centerX = currentMouseX;
  const centerY = currentMouseY;

  while (Date.now() - startTime < durationMs) {
    // Small random drift
    const drift = getMicroJitter(cfg.jitterIntensity * 4);
    const newX = Math.max(0, Math.min(1920, centerX + drift.dx * 5));
    const newY = Math.max(0, Math.min(1080, centerY + drift.dy * 5));

    await page.mouse.move(newX, newY);
    currentMouseX = newX;
    currentMouseY = newY;

    // Variable wait between micro-movements
    await randomDelay(150, 600);
  }

  // Return near original position
  await page.mouse.move(centerX + (Math.random() - 0.5) * 10, centerY + (Math.random() - 0.5) * 10);
}

/**
 * Human-like wait with micro-activity
 */
export async function humanWait(durationMs: number): Promise<void> {
  const variance = durationMs * 0.2;
  const actualDuration = durationMs + (Math.random() - 0.5) * 2 * variance;
  await new Promise(resolve => setTimeout(resolve, Math.max(0, actualDuration)));
}

// ==================== HELPER ====================

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
