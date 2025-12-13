import { ActionHandler } from '../types';

/**
 * Play action
 * Simulates media playback for a specified duration
 * 
 * Note: This is a generic simulation. Site-specific implementations
 * should override this handler with actual media control logic.
 */
export const playAction: ActionHandler = async (context, step) => {
  const { page, log } = context;
  const duration = step.duration || 60; // Default 60 seconds

  log('info', `Simulating playback for ${duration} seconds`);

  // Try to find and interact with common media elements
  // This is intentionally generic - override for specific sites
  const mediaSelectors = [
    'video',
    'audio',
    '[data-testid="play-button"]',
    '[aria-label*="play" i]',
    '.play-button',
    '#play',
  ];

  let mediaFound = false;

  for (const selector of mediaSelectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        // Check if it's a video/audio element
        const tagName = await element.evaluate(el => el.tagName.toLowerCase());
        
        if (tagName === 'video' || tagName === 'audio') {
          // Direct media element - try to play
          await element.evaluate((el: HTMLMediaElement) => {
            el.play().catch(() => {});
          });
          log('info', `Found ${tagName} element, attempting playback`);
        } else {
          // Likely a play button - click it
          await element.click().catch(() => {});
          log('info', `Clicked play control: ${selector}`);
        }
        
        mediaFound = true;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!mediaFound) {
    log('warning', 'No media element found, simulating wait');
  }

  // Simulate playback duration with periodic activity
  const checkInterval = Math.min(duration / 4, 30) * 1000;
  let elapsed = 0;

  while (elapsed < duration * 1000) {
    const waitTime = Math.min(checkInterval, (duration * 1000) - elapsed);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    elapsed += waitTime;

    const progress = Math.round((elapsed / (duration * 1000)) * 100);
    log('debug', `Playback progress: ${progress}%`);

    // Periodic small mouse movements to maintain session
    await page.mouse.move(
      100 + Math.random() * 200,
      100 + Math.random() * 200
    );
  }

  log('success', `Playback simulation completed (${duration}s)`);
};
