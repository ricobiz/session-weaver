import { ActionHandler } from '../types';

/**
 * Click action
 * Clicks on an element specified by selector
 */
export const clickAction: ActionHandler = async (context, step) => {
  const { page, log } = context;
  const selector = step.selector || step.target;

  if (!selector) {
    throw new Error('Click action requires a selector or target');
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

  // Add slight delay for human-like behavior
  await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));

  await element.click();

  // Wait for any navigation or network activity
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

  log('success', `Clicked: ${selector}`);
};
