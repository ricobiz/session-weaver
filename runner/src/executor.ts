import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { Job, Session, ScenarioStep, ActionContext, LogLevel, StorageState, ResumeMetadata, StepState } from './types';
import { ApiClient } from './api';
import { getActionHandler } from './actions';
import { log as globalLog, createSessionLogger } from './logger';
import { 
  withRetry, 
  shouldRetry, 
  calculateRetryDelay, 
  categorizeError, 
  ErrorCategory,
  DEFAULT_RETRY_CONFIG 
} from './retry';

export interface ExecutorConfig {
  headless: boolean;
  stepRetryLimit: number;
  sessionRetryLimit: number;
}

const DEFAULT_CONFIG: ExecutorConfig = {
  headless: true,
  stepRetryLimit: 3,
  sessionRetryLimit: 3,
};

export class SessionExecutor {
  private api: ApiClient;
  private config: ExecutorConfig;

  constructor(api: ApiClient, config: Partial<ExecutorConfig> = {}) {
    this.api = api;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async execute(job: Job): Promise<{ success: boolean }> {
    const { session, delay_before_start_ms } = job;
    const sessionLog = createSessionLogger(session.id);

    sessionLog('info', `Starting execution for scenario: ${session.scenarios.name}`);
    sessionLog('info', `Profile: ${session.profiles.name} (${session.profiles.email})`);

    // Check if this is a resume
    const resumeFromStep = session.last_successful_step ?? 0;
    if (resumeFromStep > 0) {
      sessionLog('info', `Resuming from step ${resumeFromStep + 1}`);
    }

    // Apply pre-start delay
    if (delay_before_start_ms > 0) {
      sessionLog('debug', `Waiting ${delay_before_start_ms}ms before start`);
      await new Promise(resolve => setTimeout(resolve, delay_before_start_ms));
    }

    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;
    let success = false;

    try {
      // Launch browser
      browser = await this.launchBrowser(session);
      
      // Create context with profile settings
      context = await this.createContext(browser, session);
      
      // Create page
      page = await context.newPage();

      // Log session start
      await this.api.sendLog(
        session.id,
        'info',
        resumeFromStep > 0 ? `Session resumed from step ${resumeFromStep + 1}` : 'Session initialized',
        0,
        'init'
      );

      // Execute scenario steps
      const steps = session.scenarios.steps;
      const totalSteps = steps.length;
      const stepStates: Record<number, StepState> = session.resume_metadata?.stepStates || {};

      for (let i = resumeFromStep; i < steps.length; i++) {
        const step = steps[i];
        const progress = Math.round(((i + 1) / totalSteps) * 100);

        const stepResult = await this.executeStepWithRetry(
          session, 
          page, 
          context, 
          step, 
          i, 
          sessionLog
        );

        // Update step state
        stepStates[i] = {
          completed: stepResult.success,
          attempts: stepResult.attempts,
          lastError: stepResult.error,
          durationMs: stepResult.durationMs,
        };

        if (!stepResult.success) {
          // Determine if session can be resumed
          const isResumable = this.isStepResumable(step, stepResult.error);
          
          await this.api.updateSession(session.id, {
            status: 'error',
            error_message: stepResult.error,
            current_step: i,
            last_successful_step: i > 0 ? i - 1 : null,
            is_resumable: isResumable,
            resume_metadata: {
              lastSuccessfulStep: i > 0 ? i - 1 : 0,
              lastAttemptAt: new Date().toISOString(),
              stepStates,
            },
          });

          throw new Error(stepResult.error);
        }

        // Update progress and resume point
        await this.api.updateSession(session.id, {
          progress,
          current_step: i + 1,
          last_successful_step: i,
          resume_metadata: {
            lastSuccessfulStep: i,
            lastAttemptAt: new Date().toISOString(),
            stepStates,
          },
        });
      }

      // Save storage state back to profile
      await this.saveStorageState(context, session.profiles.id);

      // Mark session as complete
      await this.api.updateSession(session.id, {
        status: 'success',
        progress: 100,
        current_step: totalSteps,
        last_successful_step: totalSteps - 1,
        is_resumable: false,
      });

      await this.api.sendLog(
        session.id,
        'success',
        'Session completed successfully',
        totalSteps,
        'complete'
      );

      sessionLog('success', 'Session completed successfully');
      success = true;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      sessionLog('error', `Session failed: ${errorMessage}`);

      await this.api.sendLog(
        session.id,
        'error',
        `Session failed: ${errorMessage}`,
        undefined,
        'error',
        { stack: error instanceof Error ? error.stack : undefined }
      );

    } finally {
      // Cleanup
      if (page) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    }

    return { success };
  }

  private async executeStepWithRetry(
    session: Session,
    page: Page,
    context: BrowserContext,
    step: ScenarioStep,
    stepIndex: number,
    log: (level: LogLevel, message: string, details?: Record<string, unknown>) => void
  ): Promise<{ success: boolean; attempts: number; error?: string; durationMs: number }> {
    const maxRetries = step.maxRetries ?? this.config.stepRetryLimit;
    const isRetryable = step.retryable !== false; // Default to retryable
    let attempts = 0;
    let lastError: string | undefined;
    const startTime = Date.now();

    while (attempts <= maxRetries) {
      attempts++;
      const attemptStart = Date.now();

      try {
        await this.executeStep(session, page, context, step, stepIndex, log);
        
        const durationMs = Date.now() - startTime;
        return { success: true, attempts, durationMs };

      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        const category = categorizeError(lastError);
        
        log('warning', `Step ${stepIndex + 1} failed (attempt ${attempts}/${maxRetries + 1}): ${lastError}`);

        // Don't retry fatal errors or non-retryable steps
        if (category === ErrorCategory.FATAL || !isRetryable) {
          break;
        }

        // Check if we should retry
        if (attempts <= maxRetries && shouldRetry(lastError, attempts - 1, maxRetries)) {
          const delayMs = calculateRetryDelay(attempts - 1);
          log('info', `Retrying step ${stepIndex + 1} in ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        } else {
          break;
        }
      }
    }

    const durationMs = Date.now() - startTime;
    return { success: false, attempts, error: lastError, durationMs };
  }

  private isStepResumable(step: ScenarioStep, error?: string): boolean {
    // Non-resumable conditions
    if (error) {
      const category = categorizeError(error);
      if (category === ErrorCategory.FATAL) {
        return false;
      }
    }

    // These actions are generally not resumable mid-flow
    const nonResumableActions = ['open'];
    if (nonResumableActions.includes(step.action)) {
      return true; // But you can start fresh from them
    }

    return true;
  }

  private async launchBrowser(session: Session): Promise<Browser> {
    const networkConfig = session.profiles.network_config;
    
    const launchOptions: any = {
      headless: this.config.headless,
    };

    // Apply proxy if configured
    if (networkConfig?.proxy) {
      launchOptions.proxy = {
        server: networkConfig.proxy.server,
        username: networkConfig.proxy.username,
        password: networkConfig.proxy.password,
      };
    }

    return chromium.launch(launchOptions);
  }

  private async createContext(browser: Browser, session: Session): Promise<BrowserContext> {
    const profile = session.profiles;
    const networkConfig = profile.network_config;

    const contextOptions: any = {};

    // Apply viewport
    if (networkConfig?.viewport) {
      contextOptions.viewport = networkConfig.viewport;
    } else {
      contextOptions.viewport = { width: 1920, height: 1080 };
    }

    // Apply user agent
    if (networkConfig?.userAgent) {
      contextOptions.userAgent = networkConfig.userAgent;
    }

    // Apply locale
    if (networkConfig?.locale) {
      contextOptions.locale = networkConfig.locale;
    }

    // Apply timezone
    if (networkConfig?.timezone) {
      contextOptions.timezoneId = networkConfig.timezone;
    }

    // Apply storage state if available
    if (profile.storage_state && Object.keys(profile.storage_state).length > 0) {
      contextOptions.storageState = profile.storage_state;
    }

    return browser.newContext(contextOptions);
  }

  private async executeStep(
    session: Session,
    page: Page,
    context: BrowserContext,
    step: ScenarioStep,
    stepIndex: number,
    log: (level: LogLevel, message: string, details?: Record<string, unknown>) => void
  ): Promise<void> {
    const actionName = step.action;
    const handler = getActionHandler(actionName);

    if (!handler) {
      throw new Error(`Unknown action: ${actionName}`);
    }

    log('info', `Executing step ${stepIndex + 1}: ${actionName}`);

    const stepStart = Date.now();

    // Log step start to API
    await this.api.sendLog(
      session.id,
      'info',
      `Executing: ${actionName}`,
      stepIndex,
      actionName
    );

    // Create action context
    const actionContext: ActionContext = {
      page,
      context,
      session,
      step,
      stepIndex,
      log: async (level: LogLevel, message: string, details?: Record<string, unknown>) => {
        log(level, message, details);
        await this.api.sendLog(session.id, level, message, stepIndex, actionName, details);
      },
    };

    try {
      await handler(actionContext, step);
      const durationMs = Date.now() - stepStart;

      await this.api.sendLog(
        session.id,
        'success',
        `Completed: ${actionName}`,
        stepIndex,
        actionName,
        { durationMs },
        durationMs
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const durationMs = Date.now() - stepStart;
      
      await this.api.sendLog(
        session.id,
        'error',
        `Failed: ${actionName} - ${errorMessage}`,
        stepIndex,
        actionName,
        undefined,
        durationMs
      );

      throw error;
    }
  }

  private async saveStorageState(context: BrowserContext, profileId: string): Promise<void> {
    try {
      const storageState = await context.storageState();
      await this.api.saveStorageState(profileId, storageState as StorageState);
      globalLog('debug', `Storage state saved for profile: ${profileId}`);
    } catch (error) {
      globalLog('warning', `Failed to save storage state: ${error}`);
    }
  }
}
