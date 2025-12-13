import { ActionHandler } from '../types';

/**
 * Like action
 * Attempts to find and click a like/favorite button
 * 
 * Note: This is a generic implementation. Site-specific versions
 * should override with actual like button selectors.
 */
export const likeAction: ActionHandler = async (context, step) => {
  const { page, log } = context;
  const selector = step.selector;

  log('info', 'Attempting like action');

  // If a specific selector is provided, use it
  if (selector) {
    const element = await page.waitForSelector(selector, {
      state: 'visible',
      timeout: 5000,
    });
    
    if (element) {
      await element.click();
      log('success', `Liked via: ${selector}`);
      return;
    }
  }

  // Generic like button detection
  const likeSelectors = [
    '[aria-label*="like" i]',
    '[aria-label*="favorite" i]',
    '[aria-label*="heart" i]',
    '[data-testid*="like"]',
    '[data-testid*="heart"]',
    '.like-button',
    '.heart-button',
    '.favorite-button',
    'button[class*="like"]',
    'button[class*="heart"]',
  ];

  for (const likeSelector of likeSelectors) {
    try {
      const element = await page.$(likeSelector);
      if (element) {
        // Check if already liked (common patterns)
        const isLiked = await element.evaluate(el => {
          const classes = el.className.toLowerCase();
          const ariaPressed = el.getAttribute('aria-pressed');
          return classes.includes('liked') || 
                 classes.includes('active') ||
                 ariaPressed === 'true';
        });

        if (isLiked) {
          log('info', 'Already liked, skipping');
          return;
        }

        await element.click();
        log('success', `Liked via: ${likeSelector}`);
        return;
      }
    } catch {
      continue;
    }
  }

  log('warning', 'No like button found');
};
