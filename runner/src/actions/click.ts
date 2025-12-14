import { ActionHandler } from '../types';

/**
 * Click action
 * Clicks on an element specified by selector OR visual description
 * 
 * Supports:
 * - CSS selector: { selector: ".play-button" }
 * - Visual description: { visual: "green play button" }
 * - Coordinates: { x: 123, y: 456 }
 */
export const clickAction: ActionHandler = async (context, step) => {
  const { page, log, session } = context;
  const selector = step.selector || step.target;
  const visual = (step as any).visual;
  const coordinates = (step as any).x !== undefined && (step as any).y !== undefined;

  // Human-like delay before click
  await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));

  // Case 1: Direct coordinates provided
  if (coordinates) {
    const x = (step as any).x;
    const y = (step as any).y;
    log('info', `Clicking coordinates: (${x}, ${y})`);
    await page.mouse.click(x, y);
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    log('success', `Clicked at (${x}, ${y})`);
    return;
  }

  // Case 2: Visual description - use AI vision
  if (visual) {
    log('info', `Finding element visually: "${visual}"`);
    
    // Take screenshot
    const screenshot = await page.screenshot({ type: 'png' });
    const base64 = screenshot.toString('base64');

    // Call vision API
    const apiUrl = process.env.API_BASE_URL || 'http://localhost:54321/functions/v1/session-api';
    const response = await fetch(`${apiUrl}/vision/find-element`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        screenshot: base64,
        description: visual,
        multiple: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Vision API failed: ${response.status}`);
    }

    const result = await response.json();
    
    if (!result.found) {
      throw new Error(`Element not found visually: "${visual}"`);
    }

    log('info', `Found element at (${result.x}, ${result.y}) - ${result.element_type || 'unknown'}: ${result.label || visual}`);
    
    // Click at found coordinates
    await page.mouse.click(result.x, result.y);
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    log('success', `Clicked visually found element: "${visual}"`);
    return;
  }

  // Case 3: CSS selector (original behavior)
  if (!selector) {
    throw new Error('Click action requires selector, visual description, or coordinates');
  }

  log('info', `Clicking: ${selector}`);

  // Wait for element to be visible
  const element = await page.waitForSelector(selector, {
    state: 'visible',
    timeout: 10000,
  });

  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }

  await element.click();

  // Wait for any navigation or network activity
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

  log('success', `Clicked: ${selector}`);
};

/**
 * Smart click - tries selector first, falls back to visual detection
 */
export const smartClickAction: ActionHandler = async (context, step) => {
  const { page, log } = context;
  const selector = step.selector || step.target;
  const visual = (step as any).visual || (step as any).fallback_visual;

  // Try selector first
  if (selector) {
    try {
      const element = await page.waitForSelector(selector, {
        state: 'visible',
        timeout: 3000,
      });
      
      if (element) {
        await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
        await element.click();
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        log('success', `Smart click: selector worked - ${selector}`);
        return;
      }
    } catch {
      log('warning', `Selector failed: ${selector}, trying visual detection...`);
    }
  }

  // Fallback to visual detection
  if (visual) {
    log('info', `Smart click: using visual detection for "${visual}"`);
    
    const screenshot = await page.screenshot({ type: 'png' });
    const base64 = screenshot.toString('base64');

    const apiUrl = process.env.API_BASE_URL || 'http://localhost:54321/functions/v1/session-api';
    const response = await fetch(`${apiUrl}/vision/find-element`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        screenshot: base64,
        description: visual,
        multiple: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Vision API failed: ${response.status}`);
    }

    const result = await response.json();
    
    if (!result.found) {
      throw new Error(`Element not found by selector "${selector}" or visually "${visual}"`);
    }

    await page.mouse.click(result.x, result.y);
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    log('success', `Smart click: visual detection succeeded at (${result.x}, ${result.y})`);
    return;
  }

  throw new Error('Smart click failed: no selector or visual description provided');
};
