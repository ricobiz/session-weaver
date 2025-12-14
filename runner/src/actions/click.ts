import { ActionHandler } from '../types';
import { humanClick, humanMouseMove, randomDelay } from '../stealth/human-behavior';

const VISION_API_TIMEOUT = 15000;

/**
 * Click action with automatic visual fallback
 * 
 * Execution flow (invisible to operator):
 * 1. Try CSS selector
 * 2. If fails, automatically use vision-based detection
 * 3. Log fallback usage for observability
 */
export const clickAction: ActionHandler = async (context, step) => {
  const { page, log, session } = context;
  const selector = step.selector || step.target;

  if (!selector) {
    throw new Error('Click action requires a selector or target');
  }

  // Human-like delay before interaction (variable timing)
  await randomDelay(150, 400);

  // Phase 1: Try standard selector
  try {
    const element = await page.waitForSelector(selector, {
      state: 'visible',
      timeout: 5000,
    });

    if (element) {
      // Get element bounding box for human-like clicking
      const box = await element.boundingBox();
      if (box) {
        // Click with human-like mouse movement
        const clickX = box.x + box.width / 2 + (Math.random() - 0.5) * (box.width * 0.3);
        const clickY = box.y + box.height / 2 + (Math.random() - 0.5) * (box.height * 0.3);
        await humanClick(page, clickX, clickY);
      } else {
        await element.click();
      }
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      log('success', `Clicked: ${selector}`);
      return;
    }
  } catch (selectorError) {
    log('warning', `Selector failed: ${selector}, attempting visual fallback...`, {
      error: selectorError instanceof Error ? selectorError.message : 'Unknown'
    });
  }

  // Phase 2: Automatic visual fallback
  log('info', 'Using visual element detection (automatic fallback)');
  
  try {
    // Take screenshot for vision analysis
    const screenshot = await page.screenshot({ type: 'png' });
    const base64 = screenshot.toString('base64');
    const viewportSize = page.viewportSize() || { width: 1280, height: 720 };

    // Build visual description from selector
    const visualDescription = buildVisualDescription(selector);

    // Call vision API
    const apiUrl = process.env.API_BASE_URL || 'http://localhost:54321/functions/v1/session-api';
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VISION_API_TIMEOUT);

    const response = await fetch(`${apiUrl}/vision/find-element`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        screenshot: base64,
        description: visualDescription,
        viewport: viewportSize,
        context: {
          original_selector: selector,
          page_url: page.url(),
        }
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Vision API returned ${response.status}`);
    }

    const result = await response.json();

    if (!result.found) {
      throw new Error(`Element not found by selector or vision: "${selector}"`);
    }

    // Log visual fallback usage (visible in session timeline)
    log('info', 'Visual fallback used', {
      visual_detection: true,
      coordinates: { x: result.x, y: result.y },
      confidence: result.confidence,
      element_type: result.element_type,
      detected_label: result.label,
      original_selector: selector,
      screenshot_taken: true,
    });

    // Click at detected coordinates with human-like behavior
    await humanClick(page, result.x, result.y);
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    
    log('success', `Clicked via visual detection at (${result.x}, ${result.y})`);

  } catch (visionError) {
    log('error', 'Visual fallback failed', {
      error: visionError instanceof Error ? visionError.message : 'Unknown',
      original_selector: selector,
    });
    throw new Error(`Click failed - selector and visual detection both failed for: ${selector}`);
  }
};

/**
 * Build a visual description from a CSS selector
 * Converts technical selectors into natural language for vision AI
 */
function buildVisualDescription(selector: string): string {
  const descriptions: string[] = [];

  // Extract element type
  const tagMatch = selector.match(/^(\w+)/);
  if (tagMatch) {
    const tag = tagMatch[1].toLowerCase();
    const tagNames: Record<string, string> = {
      'button': 'button',
      'a': 'link',
      'input': 'input field',
      'img': 'image',
      'svg': 'icon',
      'span': 'text element',
      'div': 'container',
      'video': 'video player',
      'audio': 'audio player',
    };
    if (tagNames[tag]) descriptions.push(tagNames[tag]);
  }

  // Extract class names for context
  const classMatches = selector.match(/\.([a-zA-Z0-9_-]+)/g);
  if (classMatches) {
    for (const cls of classMatches) {
      const className = cls.substring(1).toLowerCase();
      
      // Map common class patterns to visual descriptions
      if (className.includes('play')) descriptions.push('play button');
      else if (className.includes('pause')) descriptions.push('pause button');
      else if (className.includes('like') || className.includes('heart') || className.includes('favorite')) descriptions.push('like or heart button');
      else if (className.includes('share')) descriptions.push('share button');
      else if (className.includes('comment')) descriptions.push('comment button');
      else if (className.includes('subscribe') || className.includes('follow')) descriptions.push('subscribe or follow button');
      else if (className.includes('search')) descriptions.push('search button or field');
      else if (className.includes('close') || className.includes('dismiss')) descriptions.push('close button (X)');
      else if (className.includes('next') || className.includes('forward')) descriptions.push('next or forward button');
      else if (className.includes('prev') || className.includes('back')) descriptions.push('previous or back button');
      else if (className.includes('menu') || className.includes('hamburger')) descriptions.push('menu button');
      else if (className.includes('settings') || className.includes('gear') || className.includes('cog')) descriptions.push('settings button');
      else if (className.includes('volume') || className.includes('mute')) descriptions.push('volume or mute button');
      else if (className.includes('fullscreen')) descriptions.push('fullscreen button');
      else if (className.includes('download')) descriptions.push('download button');
      else if (className.includes('upload')) descriptions.push('upload button');
      else if (className.includes('submit') || className.includes('send')) descriptions.push('submit or send button');
      else if (className.includes('cancel')) descriptions.push('cancel button');
      else if (className.includes('confirm') || className.includes('ok') || className.includes('accept')) descriptions.push('confirm or OK button');
    }
  }

  // Extract aria-label or data attributes
  const ariaMatch = selector.match(/\[aria-label=["']([^"']+)["']\]/);
  if (ariaMatch) {
    descriptions.push(`element labeled "${ariaMatch[1]}"`);
  }

  const titleMatch = selector.match(/\[title=["']([^"']+)["']\]/);
  if (titleMatch) {
    descriptions.push(`element with title "${titleMatch[1]}"`);
  }

  // Extract text content hint
  const textMatch = selector.match(/:contains\(["']([^"']+)["']\)/);
  if (textMatch) {
    descriptions.push(`element containing text "${textMatch[1]}"`);
  }

  // Build final description
  if (descriptions.length === 0) {
    // Fallback: use sanitized selector as description
    return `clickable element matching: ${selector.replace(/[^\w\s-]/g, ' ').trim()}`;
  }

  return descriptions.join(', ');
}

/**
 * Smart click - same as click but exported for compatibility
 * Vision fallback is now automatic in all click actions
 */
export const smartClickAction = clickAction;
