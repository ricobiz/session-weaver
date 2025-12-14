/**
 * Centralized configuration for timeouts and limits
 */

export const TIMEOUTS = {
  // Navigation
  NAVIGATION: 30000,
  NETWORK_IDLE: 5000,
  DOM_CONTENT_LOADED: 30000,
  
  // Element waiting
  ELEMENT_VISIBLE: 5000,
  ELEMENT_CLICK: 10000,
  
  // Vision API
  VISION_API: 15000,
  
  // General actions
  ACTION_DEFAULT: 10000,
  PAGE_STABILIZE: 500,
  
  // Captcha
  CAPTCHA_RESOLVE: 120000,
} as const;

export const LIMITS = {
  // Network requests tracking
  MAX_NETWORK_REQUESTS: 100,
  
  // Autonomous mode
  MAX_AUTONOMOUS_ACTIONS: 50,
  
  // Retries
  MAX_STEP_RETRIES: 3,
  MAX_SESSION_RETRIES: 3,
  
  // Logs
  MAX_SESSION_LOGS: 100,
} as const;

export const DELAYS = {
  // Human behavior
  MIN_BEFORE_CLICK: 50,
  MAX_BEFORE_CLICK: 150,
  MIN_AFTER_CLICK: 100,
  MAX_AFTER_CLICK: 300,
  
  // Typing
  MIN_KEYSTROKE: 30,
  MAX_KEYSTROKE: 80,
  
  // Scrolling
  SCROLL_STEP_MIN: 30,
  SCROLL_STEP_MAX: 80,
} as const;
