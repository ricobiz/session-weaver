import { LogLevel } from './types';

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

// Error categories
export enum ErrorCategory {
  RECOVERABLE = 'recoverable',
  FATAL = 'fatal',
  TRANSIENT = 'transient',
}

// Known error patterns and their categories
const ERROR_PATTERNS: Array<{ pattern: RegExp; category: ErrorCategory }> = [
  // Transient errors - always retry
  { pattern: /timeout/i, category: ErrorCategory.TRANSIENT },
  { pattern: /ECONNRESET/i, category: ErrorCategory.TRANSIENT },
  { pattern: /ECONNREFUSED/i, category: ErrorCategory.TRANSIENT },
  { pattern: /ETIMEDOUT/i, category: ErrorCategory.TRANSIENT },
  { pattern: /network/i, category: ErrorCategory.TRANSIENT },
  { pattern: /ERR_NETWORK/i, category: ErrorCategory.TRANSIENT },
  { pattern: /ERR_CONNECTION/i, category: ErrorCategory.TRANSIENT },
  
  // Recoverable errors - retry with backoff
  { pattern: /element not found/i, category: ErrorCategory.RECOVERABLE },
  { pattern: /selector/i, category: ErrorCategory.RECOVERABLE },
  { pattern: /navigation/i, category: ErrorCategory.RECOVERABLE },
  { pattern: /waiting for/i, category: ErrorCategory.RECOVERABLE },
  { pattern: /detached/i, category: ErrorCategory.RECOVERABLE },
  
  // Fatal errors - do not retry
  { pattern: /authentication/i, category: ErrorCategory.FATAL },
  { pattern: /unauthorized/i, category: ErrorCategory.FATAL },
  { pattern: /forbidden/i, category: ErrorCategory.FATAL },
  { pattern: /invalid.*credential/i, category: ErrorCategory.FATAL },
  { pattern: /browser.*closed/i, category: ErrorCategory.FATAL },
  { pattern: /context.*destroyed/i, category: ErrorCategory.FATAL },
  { pattern: /unknown action/i, category: ErrorCategory.FATAL },
];

/**
 * Categorize an error to determine retry behavior
 */
export function categorizeError(error: Error | string): ErrorCategory {
  const message = error instanceof Error ? error.message : error;
  
  for (const { pattern, category } of ERROR_PATTERNS) {
    if (pattern.test(message)) {
      return category;
    }
  }
  
  // Default to recoverable - try to recover from unknown errors
  return ErrorCategory.RECOVERABLE;
}

/**
 * Check if an error should be retried
 */
export function shouldRetry(error: Error | string, attemptCount: number, maxRetries: number): boolean {
  if (attemptCount >= maxRetries) {
    return false;
  }
  
  const category = categorizeError(error);
  return category !== ErrorCategory.FATAL;
}

/**
 * Calculate delay for next retry with exponential backoff
 */
export function calculateRetryDelay(
  attemptCount: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  const delay = Math.min(
    config.baseDelayMs * Math.pow(config.backoffMultiplier, attemptCount),
    config.maxDelayMs
  );
  
  // Add jitter (±20%)
  const jitter = delay * 0.2 * (Math.random() * 2 - 1);
  return Math.round(delay + jitter);
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    config?: RetryConfig;
    onRetry?: (error: Error, attempt: number, delayMs: number) => void;
  } = {}
): Promise<T> {
  const { maxRetries = 3, config = DEFAULT_RETRY_CONFIG, onRetry } = options;
  
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (!shouldRetry(lastError, attempt, maxRetries)) {
        throw lastError;
      }
      
      const delayMs = calculateRetryDelay(attempt, config);
      onRetry?.(lastError, attempt + 1, delayMs);
      
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw lastError;
}

/**
 * Create a retry context for tracking step-level retries
 */
export interface StepRetryContext {
  stepIndex: number;
  attemptCount: number;
  maxAttempts: number;
  lastError?: string;
}

export function createStepRetryContext(
  stepIndex: number,
  maxAttempts: number = 3
): StepRetryContext {
  return {
    stepIndex,
    attemptCount: 0,
    maxAttempts,
  };
}

export function incrementRetry(context: StepRetryContext, error: string): StepRetryContext {
  return {
    ...context,
    attemptCount: context.attemptCount + 1,
    lastError: error,
  };
}

export function canRetryStep(context: StepRetryContext): boolean {
  if (context.attemptCount >= context.maxAttempts) {
    return false;
  }
  
  if (context.lastError) {
    return shouldRetry(context.lastError, context.attemptCount, context.maxAttempts);
  }
  
  return true;
}
