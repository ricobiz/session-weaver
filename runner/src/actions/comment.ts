import { ActionHandler } from '../types';

/**
 * Comment action
 * Attempts to post a comment/feedback
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
      await typeWithHumanDelay(page, input, text);
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
        // Focus the input
        await input.click();
        await new Promise(resolve => setTimeout(resolve, 300));

        await typeWithHumanDelay(page, input, text);
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

// Helper: Type with human-like delays
async function typeWithHumanDelay(
  page: any,
  element: any,
  text: string
): Promise<void> {
  for (const char of text) {
    await element.type(char, { delay: 50 + Math.random() * 100 });
  }
}

// Helper: Submit the comment
async function submitComment(page: any, log: any): Promise<void> {
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
        await button.click();
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
