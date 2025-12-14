/**
 * Type Action
 * Human-like text input with realistic typing speed and patterns
 */

import { Page } from 'playwright';
import { ActionHandler, ActionResult } from '../types';
import { log } from '../logger';
import { humanType, humanClick, randomDelay } from '../stealth/human-behavior';
import { TIMEOUTS, DELAYS } from '../config';

/**
 * Type text into an element with human-like behavior
 */
export const typeAction: ActionHandler = async (
  page: Page,
  params: Record<string, unknown>
): Promise<ActionResult> => {
  const text = params.text as string;
  const selector = params.selector as string | undefined;
  const clearFirst = params.clear_first !== false; // Default: clear existing text
  const pressEnter = params.press_enter === true;
  const speed = (params.speed as 'slow' | 'normal' | 'fast') || 'normal';

  if (!text) {
    return {
      success: false,
      message: 'No text provided',
      screenshot: null,
    };
  }

  const startTime = Date.now();
  log('info', `[type] Typing "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}" with speed=${speed}`);

  try {
    // If selector provided, click on it first
    if (selector) {
      log('debug', `[type] Focusing element: ${selector}`);
      
      try {
        const element = await page.waitForSelector(selector, { 
          timeout: TIMEOUTS.ELEMENT_WAIT,
          state: 'visible'
        });
        
        if (!element) {
          return {
            success: false,
            message: `Element not found: ${selector}`,
            screenshot: null,
          };
        }

        // Get element position for human-like click
        const box = await element.boundingBox();
        if (box) {
          // Click in a random position within the element (more human-like)
          const clickX = box.x + box.width * (0.3 + Math.random() * 0.4);
          const clickY = box.y + box.height * (0.3 + Math.random() * 0.4);
          await humanClick(page, clickX, clickY);
        } else {
          await element.click();
        }

        // Small pause after clicking before typing
        await randomDelay(DELAYS.HUMAN_PAUSE_MIN, DELAYS.HUMAN_PAUSE_MAX);

        // Clear existing text if requested
        if (clearFirst) {
          await page.keyboard.press('Control+a');
          await randomDelay(30, 80);
          await page.keyboard.press('Backspace');
          await randomDelay(50, 100);
        }
      } catch (error) {
        log('warn', `[type] Could not focus element, trying direct typing: ${error}`);
      }
    }

    // Type with human-like behavior
    await humanType(page, text, { 
      typingSpeed: speed,
      typingMistakes: false, // Disabled for reliability
      randomDelays: true,
    });

    // Optional: press Enter after typing
    if (pressEnter) {
      await randomDelay(100, 200);
      await page.keyboard.press('Enter');
      log('debug', '[type] Pressed Enter');
    }

    const duration = Date.now() - startTime;
    const avgSpeed = text.length / (duration / 1000);

    log('success', `[type] Typed ${text.length} chars in ${duration}ms (~${avgSpeed.toFixed(1)} chars/sec)`);

    // Take screenshot of result
    const screenshot = await page.screenshot({ type: 'png' });

    return {
      success: true,
      message: `Typed ${text.length} characters`,
      screenshot: screenshot.toString('base64'),
      data: {
        text_length: text.length,
        duration_ms: duration,
        chars_per_second: avgSpeed,
        speed_setting: speed,
        pressed_enter: pressEnter,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('error', `[type] Failed: ${errorMessage}`);

    return {
      success: false,
      message: `Type failed: ${errorMessage}`,
      screenshot: null,
    };
  }
};
