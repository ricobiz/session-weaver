import { ScenarioStep } from './types';

// JSON Schema for scenario steps
export const STEP_SCHEMA = {
  type: 'object',
  required: ['action'],
  properties: {
    action: {
      type: 'string',
      enum: ['open', 'play', 'scroll', 'click', 'like', 'comment', 'wait'],
    },
    target: { type: 'string' },
    duration: { type: 'number', minimum: 0 },
    text: { type: 'string' },
    randomized: { type: 'boolean' },
    selector: { type: 'string' },
    retryable: { type: 'boolean' },
    maxRetries: { type: 'number', minimum: 0, maximum: 10 },
  },
};

// Action-specific requirements
export const ACTION_REQUIREMENTS: Record<string, { required?: string[]; optional?: string[] }> = {
  open: {
    required: ['target'],
    optional: ['duration'],
  },
  play: {
    optional: ['duration', 'selector'],
  },
  scroll: {
    optional: ['duration', 'randomized'],
  },
  click: {
    required: ['selector'],
    optional: ['duration'],
  },
  like: {
    optional: ['selector'],
  },
  comment: {
    required: ['text'],
    optional: ['selector'],
  },
  wait: {
    required: ['duration'],
  },
};

// Estimated duration per action (in seconds)
export const ACTION_DURATION_ESTIMATES: Record<string, number> = {
  open: 5,
  play: 30,
  scroll: 5,
  click: 2,
  like: 2,
  comment: 10,
  wait: 0, // Uses explicit duration
};

export interface ValidationError {
  stepIndex: number;
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  estimatedDurationSeconds: number;
  stepBreakdown: Array<{
    index: number;
    action: string;
    estimatedSeconds: number;
  }>;
}

/**
 * Validate a scenario's steps
 */
export function validateScenario(steps: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const stepBreakdown: ValidationResult['stepBreakdown'] = [];
  let estimatedDurationSeconds = 0;

  // Check if steps is an array
  if (!Array.isArray(steps)) {
    return {
      valid: false,
      errors: [{ stepIndex: -1, message: 'Steps must be an array', severity: 'error' }],
      warnings: [],
      estimatedDurationSeconds: 0,
      stepBreakdown: [],
    };
  }

  // Validate each step
  (steps as ScenarioStep[]).forEach((step, index) => {
    const stepErrors = validateStep(step, index);
    errors.push(...stepErrors.filter(e => e.severity === 'error'));
    warnings.push(...stepErrors.filter(e => e.severity === 'warning'));

    // Calculate duration
    const duration = calculateStepDuration(step);
    estimatedDurationSeconds += duration;
    stepBreakdown.push({
      index,
      action: step.action || 'unknown',
      estimatedSeconds: duration,
    });
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    estimatedDurationSeconds,
    stepBreakdown,
  };
}

/**
 * Validate a single step
 */
function validateStep(step: ScenarioStep, index: number): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check if step is an object
  if (typeof step !== 'object' || step === null) {
    return [{ stepIndex: index, message: 'Step must be an object', severity: 'error' }];
  }

  // Check action field
  if (!step.action) {
    errors.push({ stepIndex: index, field: 'action', message: 'Action is required', severity: 'error' });
    return errors;
  }

  // Check if action is valid
  const validActions = Object.keys(ACTION_REQUIREMENTS);
  if (!validActions.includes(step.action)) {
    errors.push({
      stepIndex: index,
      field: 'action',
      message: `Unknown action "${step.action}". Valid actions: ${validActions.join(', ')}`,
      severity: 'error',
    });
    return errors;
  }

  // Check action-specific requirements
  const requirements = ACTION_REQUIREMENTS[step.action];
  if (requirements.required) {
    for (const field of requirements.required) {
      if (!(field in step) || step[field as keyof ScenarioStep] === undefined) {
        errors.push({
          stepIndex: index,
          field,
          message: `Field "${field}" is required for action "${step.action}"`,
          severity: 'error',
        });
      }
    }
  }

  // Validate field types
  if (step.duration !== undefined && typeof step.duration !== 'number') {
    errors.push({ stepIndex: index, field: 'duration', message: 'Duration must be a number', severity: 'error' });
  }
  if (step.duration !== undefined && step.duration < 0) {
    errors.push({ stepIndex: index, field: 'duration', message: 'Duration must be non-negative', severity: 'error' });
  }

  if (step.target !== undefined && typeof step.target !== 'string') {
    errors.push({ stepIndex: index, field: 'target', message: 'Target must be a string', severity: 'error' });
  }

  if (step.text !== undefined && typeof step.text !== 'string') {
    errors.push({ stepIndex: index, field: 'text', message: 'Text must be a string', severity: 'error' });
  }

  if (step.selector !== undefined && typeof step.selector !== 'string') {
    errors.push({ stepIndex: index, field: 'selector', message: 'Selector must be a string', severity: 'error' });
  }

  // Warnings for potential issues
  if (step.action === 'open' && step.target && !isValidUrl(step.target)) {
    errors.push({
      stepIndex: index,
      field: 'target',
      message: 'Target does not appear to be a valid URL',
      severity: 'warning',
    });
  }

  if (step.duration && step.duration > 300) {
    errors.push({
      stepIndex: index,
      field: 'duration',
      message: 'Duration is very long (>5 minutes). This may cause issues.',
      severity: 'warning',
    });
  }

  return errors;
}

/**
 * Calculate estimated duration for a step
 */
function calculateStepDuration(step: ScenarioStep): number {
  if (step.duration) {
    return step.duration;
  }
  return ACTION_DURATION_ESTIMATES[step.action] || 3;
}

/**
 * Check if a string is a valid URL
 */
function isValidUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Format validation result as human-readable string
 */
export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = [];

  if (result.valid) {
    lines.push('✓ Scenario is valid');
  } else {
    lines.push('✗ Scenario has validation errors');
  }

  lines.push(`Estimated duration: ${result.estimatedDurationSeconds}s`);
  lines.push('');

  if (result.errors.length > 0) {
    lines.push('Errors:');
    for (const error of result.errors) {
      lines.push(`  Step ${error.stepIndex + 1}: ${error.message}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push('Warnings:');
    for (const warning of result.warnings) {
      lines.push(`  Step ${warning.stepIndex + 1}: ${warning.message}`);
    }
  }

  return lines.join('\n');
}
