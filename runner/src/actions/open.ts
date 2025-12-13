import { ActionHandler } from '../types';

/**
 * Open/Navigate action
 * Navigates to a URL specified in the step target
 */
export const openAction: ActionHandler = async (context, step) => {
  const { page, log } = context;
  const url = step.target;

  if (!url) {
    throw new Error('Open action requires a target URL');
  }

  log('info', `Navigating to: ${url}`);
  
  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  // Wait for network to settle
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
    log('warning', 'Network did not fully settle, continuing...');
  });

  log('success', `Page loaded: ${page.url()}`);
};
