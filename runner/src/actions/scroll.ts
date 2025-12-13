import { ActionHandler } from '../types';

/**
 * Scroll action
 * Scrolls the page, optionally with randomization
 */
export const scrollAction: ActionHandler = async (context, step) => {
  const { page, log } = context;
  const randomized = step.randomized ?? true;

  log('info', `Scrolling page (randomized: ${randomized})`);

  if (randomized) {
    // Random scroll behavior - multiple small scrolls
    const scrollCount = 3 + Math.floor(Math.random() * 4); // 3-6 scrolls
    
    for (let i = 0; i < scrollCount; i++) {
      const scrollAmount = 200 + Math.floor(Math.random() * 400); // 200-600px
      const delay = 500 + Math.floor(Math.random() * 1000); // 500-1500ms
      
      await page.evaluate((amount) => {
        window.scrollBy({ top: amount, behavior: 'smooth' });
      }, scrollAmount);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  } else {
    // Simple scroll to bottom
    await page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    });
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  log('success', 'Scroll completed');
};
