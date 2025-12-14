import { ActionHandler } from '../types';
import { humanType, humanClick, randomDelay } from '../stealth/human-behavior';

/**
 * Comment action with human-like typing
 * Attempts to post a comment/feedback with natural behavior
 * 
 * Note: This is a generic implementation. Site-specific versions
 * should override with actual comment input selectors.
 */
export const commentAction: ActionHandler = async (context, step) => {
  const { page, log } = context;
  const text = step.text;
  const selector = step.selector;

  if (!text) {
    log('warning', 'Comment action requires text, skipping');
    return;
  }

  log('info', `Attempting to post comment: "${text.slice(0, 30)}..."`);

  // If a specific selector is provided, use it
  if (selector) {
    const input = await page.waitForSelector(selector, {
      state: 'visible',
      timeout: 5000,
    });

    if (input) {
      // Click on input with human-like behavior
      const box = await input.boundingBox();
      if (box) {
        await humanClick(page, box.x + box.width / 2, box.y + box.height / 2);
      } else {
        await input.click();
      }
      await randomDelay(200, 400);
      
      // Type with human-like delays
      await humanType(page, text);
      await submitComment(page, log);
      log('success', 'Comment posted');
      return;
    }
  }

  // Generic comment input detection
  const inputSelectors = [
    '[data-testid*="comment-input"]',
    '[aria-label*="comment" i]',
    '[aria-label*="reply" i]',
    '[placeholder*="comment" i]',
    '[placeholder*="write" i]',
    'textarea[name*="comment"]',
    'input[name*="comment"]',
    '.comment-input',
    '.reply-input',
  ];

  for (const inputSelector of inputSelectors) {
    try {
      const input = await page.$(inputSelector);
      if (input) {
        // Focus the input with human-like click
        const box = await input.boundingBox();
        if (box) {
          await humanClick(page, box.x + box.width / 2, box.y + box.height / 2);
        } else {
          await input.click();
        }
        await randomDelay(200, 400);

        // Type with human-like delays
        await humanType(page, text);
        await submitComment(page, log);
        log('success', `Comment posted via: ${inputSelector}`);
        return;
      }
    } catch {
      continue;
    }
  }

  log('warning', 'No comment input found');
};

// Helper: Submit the comment with human-like behavior
async function submitComment(page: any, log: any): Promise<void> {
  // Small delay before submitting (human hesitation)
  await randomDelay(300, 600);
  
  // Try common submit patterns
  const submitSelectors = [
    '[data-testid*="submit"]',
    '[data-testid*="post"]',
    '[aria-label*="submit" i]',
    '[aria-label*="post" i]',
    '[aria-label*="send" i]',
    'button[type="submit"]',
    '.submit-button',
    '.post-button',
    '.send-button',
  ];

  for (const submitSelector of submitSelectors) {
    try {
      const button = await page.$(submitSelector);
      if (button) {
        const box = await button.boundingBox();
        if (box) {
          await humanClick(page, box.x + box.width / 2, box.y + box.height / 2);
        } else {
          await button.click();
        }
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        return;
      }
    } catch {
      continue;
    }
  }

  // Fallback: try Enter key
  await page.keyboard.press('Enter');
  log('debug', 'Submitted via Enter key');
}
