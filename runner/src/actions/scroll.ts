import { ActionHandler } from '../types';
import { humanScroll, randomDelay, humanWait } from '../stealth/human-behavior';

/**
 * Scroll action with human-like behavior
 * Scrolls the page with natural timing and pauses
 */
export const scrollAction: ActionHandler = async (context, step) => {
  const { page, log } = context;
  const randomized = step.randomized ?? true;

  log('info', `Scrolling page (randomized: ${randomized})`);

  if (randomized) {
    // Human-like random scroll behavior
    const scrollCount = 3 + Math.floor(Math.random() * 4); // 3-6 scrolls
    
    for (let i = 0; i < scrollCount; i++) {
      const scrollAmount = 200 + Math.floor(Math.random() * 400); // 200-600px
      
      // Use human-like scrolling
      await humanScroll(page, 'down', scrollAmount);
      
      // Variable pause between scrolls (reading simulation)
      const pauseTime = 500 + Math.floor(Math.random() * 1500);
      await humanWait(pauseTime);
      
      // Occasionally scroll up a bit (human behavior - re-reading)
      if (Math.random() < 0.15) {
        const scrollBack = 50 + Math.floor(Math.random() * 100);
        await humanScroll(page, 'up', scrollBack);
        await randomDelay(300, 600);
      }
    }
  } else {
    // Simple scroll to bottom with smooth behavior
    await page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    });
    await humanWait(1000);
  }

  log('success', 'Scroll completed');
};
