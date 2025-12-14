/**
 * Type Action
 * Human-like text input with realistic typing speed and patterns
 * v2 - Fixed TypeScript errors
 */

import { Page } from 'playwright';
import { ActionContext, ScenarioStep } from '../types';
import { log } from '../logger';
import { humanType, humanClick, randomDelay } from '../stealth/human-behavior';
import { TIMEOUTS, DELAYS } from '../config';

/**
 * Type text into an element with human-like behavior
 */
export const typeAction = async (
  context: ActionContext,
  step: ScenarioStep
): Promise<void> => {
  const { page } = context;
  const text = step.text as string;
  const selector = step.selector || step.target;
  const clearFirst = true; // Default: clear existing text
  const pressEnter = false;
  const speed: 'slow' | 'normal' | 'fast' = 'normal';

  if (!text) {
    throw new Error('No text provided for type action');
  }

  const startTime = Date.now();
  log('info', `[type] Typing "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}" with speed=${speed}`);

  try {
    // If selector provided, click on it first
    if (selector) {
      log('debug', `[type] Focusing element: ${selector}`);
      
      try {
        const element = await page.waitForSelector(selector, { 
          timeout: TIMEOUTS.ELEMENT_VISIBLE,
          state: 'visible'
        });
        
        if (!element) {
          throw new Error(`Element not found: ${selector}`);
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
        await randomDelay(DELAYS.MIN_BEFORE_CLICK, DELAYS.MAX_BEFORE_CLICK);

        // Clear existing text if requested
        if (clearFirst) {
          await page.keyboard.press('Control+a');
          await randomDelay(30, 80);
          await page.keyboard.press('Backspace');
          await randomDelay(50, 100);
        }
      } catch (error) {
        log('warning', `[type] Could not focus element, trying direct typing: ${error}`);
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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('error', `[type] Failed: ${errorMessage}`);
    throw error;
  }
};
