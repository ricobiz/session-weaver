import { ActionRegistry, ActionHandler } from '../types';
import { openAction } from './open';
import { waitAction } from './wait';
import { scrollAction } from './scroll';
import { clickAction, smartClickAction } from './click';
import { playAction } from './play';
import { likeAction } from './like';
import { commentAction } from './comment';

/**
 * Action Registry
 * 
 * Maps action names to their handler functions.
 * Extend this registry to add custom actions.
 */
const actionRegistry: ActionRegistry = {
  open: openAction,
  navigate: openAction, // Alias
  goto: openAction,     // Alias
  
  wait: waitAction,
  delay: waitAction,    // Alias
  pause: waitAction,    // Alias
  
  scroll: scrollAction,
  
  click: clickAction,
  tap: clickAction,         // Alias
  'smart-click': smartClickAction, // Visual-aware click
  'visual-click': smartClickAction, // Alias for smart click
  
  play: playAction,
  listen: playAction,   // Alias
  watch: playAction,    // Alias
  
  like: likeAction,
  favorite: likeAction, // Alias
  heart: likeAction,    // Alias
  
  comment: commentAction,
  reply: commentAction,   // Alias
  feedback: commentAction, // Alias
};

/**
 * Get action handler by name
 */
export function getActionHandler(actionName: string): ActionHandler | null {
  const normalizedName = actionName.toLowerCase().trim();
  return actionRegistry[normalizedName] || null;
}

/**
 * Register a custom action handler
 */
export function registerAction(name: string, handler: ActionHandler): void {
  actionRegistry[name.toLowerCase()] = handler;
}

/**
 * Get all registered action names
 */
export function getRegisteredActions(): string[] {
  return Object.keys(actionRegistry);
}

export { actionRegistry };
