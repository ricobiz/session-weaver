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
import { detectCaptcha, resolveCaptcha } from './captcha';
import { applyStealthPatches, applyPagePatches } from './stealth';
import { generateFingerprint, getRandomPreset } from './stealth/fingerprint';
import { AutonomousExecutor } from './autonomous';

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
    const { session, delay_before_start_ms, execution_mode, autonomous } = job;
    const sessionLog = createSessionLogger(session.id);
    const isAutonomous = execution_mode === 'autonomous';

    if (isAutonomous) {
      sessionLog('info', `Starting autonomous execution for goal: ${autonomous?.goal || 'unknown'}`);
    } else {
      sessionLog('info', `Starting execution for scenario: ${session.scenarios?.name || 'unknown'}`);
    }
    
    if (session.profiles) {
      sessionLog('info', `Profile: ${session.profiles.name} (${session.profiles.email})`);
    }

    // Check if this is a resume (only for scenario mode)
    const resumeFromStep = !isAutonomous ? (session.last_successful_step ?? 0) : 0;
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
    let sessionRetryCount = 0;

    // Session-level retry loop for self-healing
    while (sessionRetryCount <= this.config.sessionRetryLimit) {
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
          isAutonomous 
            ? `Autonomous session started${sessionRetryCount > 0 ? ` (retry ${sessionRetryCount})` : ''}`
            : (resumeFromStep > 0 
              ? `Session resumed from step ${resumeFromStep + 1}${sessionRetryCount > 0 ? ` (retry ${sessionRetryCount})` : ''}` 
              : `Session initialized${sessionRetryCount > 0 ? ` (retry ${sessionRetryCount})` : ''}`),
          0,
          'init'
        );

        // ====== AUTONOMOUS MODE ======
        if (isAutonomous && autonomous) {
          const autonomousExecutor = new AutonomousExecutor(this.api);
          const startUrl = autonomous.goal?.includes('http') 
            ? autonomous.goal.match(/https?:\/\/[^\s]+/)?.[0] || 'https://www.google.com'
            : 'https://www.google.com';
          
          const agentEndpoint = `${process.env.API_BASE_URL}${autonomous.agent_endpoint}`;
          
          sessionLog('info', `Starting autonomous AI agent with endpoint: ${agentEndpoint}`);
          sessionLog('info', `Goal: ${autonomous.goal}`);
          sessionLog('info', `Start URL: ${startUrl}`);
          
          const result = await autonomousExecutor.execute(
            session,
            autonomous.goal,
            startUrl,
            agentEndpoint,
            browser!,
            context!,
            page!
          );

          if (result.success) {
            await this.api.updateSession(session.id, {
              status: 'success',
              progress: 100,
              is_resumable: false,
            });
            sessionLog('success', `Autonomous session completed (${result.actionsExecuted} actions, score: ${result.verificationScore.toFixed(2)})`);
            success = true;
          } else {
            await this.api.updateSession(session.id, {
              status: 'error',
              error_message: `Autonomous execution failed after ${result.actionsExecuted} actions`,
            });
            sessionLog('error', `Autonomous session failed (${result.actionsExecuted} actions)`);
          }
          break; // Exit retry loop
        }

        // ====== SCENARIO MODE ======
        const steps = session.scenarios?.steps || [];
        const totalSteps = steps.length;
        
        if (totalSteps === 0) {
          throw new Error('No scenario steps defined');
        }
        
        const stepStates: Record<number, StepState> = session.resume_metadata?.stepStates || {};
        const startFromStep = sessionRetryCount > 0 ? (session.last_successful_step ?? 0) : resumeFromStep;

        let allStepsCompleted = true;

        for (let i = startFromStep; i < steps.length; i++) {
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
            const errorCategory = categorizeError(stepResult.error || 'Unknown error');
            
            // Check if we should retry at session level
            const canRetrySession = isResumable && 
                                    errorCategory !== ErrorCategory.FATAL && 
                                    sessionRetryCount < this.config.sessionRetryLimit;

            await this.api.updateSession(session.id, {
              status: canRetrySession ? 'running' : 'error',
              error_message: stepResult.error,
              current_step: i,
              last_successful_step: i > 0 ? i - 1 : undefined,
              is_resumable: isResumable,
              retry_count: sessionRetryCount,
              resume_metadata: {
                lastSuccessfulStep: i > 0 ? i - 1 : 0,
                lastAttemptAt: new Date().toISOString(),
                stepStates,
                errorCategory: errorCategory,
              },
            });

            if (canRetrySession) {
              sessionLog('warning', `Step ${i + 1} failed with recoverable error. Will retry session (${sessionRetryCount + 1}/${this.config.sessionRetryLimit})`);
              allStepsCompleted = false;
              
              // Calculate backoff delay
              const retryDelay = calculateRetryDelay(sessionRetryCount);
              sessionLog('info', `Waiting ${retryDelay}ms before session retry...`);
              await new Promise(resolve => setTimeout(resolve, retryDelay));
              
              break; // Exit step loop to retry session
            } else {
              throw new Error(stepResult.error);
            }
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

        if (allStepsCompleted) {
          // Save storage state back to profile
          if (session.profiles?.id) {
            await this.saveStorageState(context, session.profiles.id);
          }

          // Mark session as complete
          await this.api.updateSession(session.id, {
            status: 'success',
            progress: 100,
            current_step: totalSteps,
            last_successful_step: totalSteps - 1,
            is_resumable: false,
            retry_count: sessionRetryCount,
          });

          await this.api.sendLog(
            session.id,
            'success',
            `Session completed successfully${sessionRetryCount > 0 ? ` after ${sessionRetryCount} retries` : ''}`,
            totalSteps,
            'complete'
          );

          sessionLog('success', `Session completed successfully${sessionRetryCount > 0 ? ` after ${sessionRetryCount} retries` : ''}`);
          success = true;
          break; // Exit retry loop - success
        }

        // Clean up before retry
        if (page) await page.close().catch(() => {});
        if (context) await context.close().catch(() => {});
        if (browser) await browser.close().catch(() => {});
        page = null;
        context = null;
        browser = null;

        sessionRetryCount++;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorCategory = categorizeError(errorMessage);
        
        sessionLog('error', `Session failed: ${errorMessage}`);

        // Check if we should retry at session level
        if (errorCategory !== ErrorCategory.FATAL && sessionRetryCount < this.config.sessionRetryLimit) {
          sessionLog('warning', `Recoverable error. Will retry session (${sessionRetryCount + 1}/${this.config.sessionRetryLimit})`);
          
          // Clean up before retry
          if (page) await page.close().catch(() => {});
          if (context) await context.close().catch(() => {});
          if (browser) await browser.close().catch(() => {});
          page = null;
          context = null;
          browser = null;

          const retryDelay = calculateRetryDelay(sessionRetryCount);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          
          sessionRetryCount++;
          continue;
        }

        await this.api.sendLog(
          session.id,
          'error',
          `Session failed: ${errorMessage}${sessionRetryCount > 0 ? ` (after ${sessionRetryCount} retries)` : ''}`,
          undefined,
          'error',
          { 
            stack: error instanceof Error ? error.stack : undefined,
            errorCategory,
            totalRetries: sessionRetryCount,
          }
        );

        break; // Exit retry loop - fatal error
      } finally {
        // Final cleanup (only if not retrying)
        if (success || sessionRetryCount >= this.config.sessionRetryLimit) {
          if (page) await page.close().catch(() => {});
          if (context) await context.close().catch(() => {});
          if (browser) await browser.close().catch(() => {});
        }
      }
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
      args: [
        // Anti-detection flags
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--no-first-run',
        '--no-default-browser-check',
        // Avoid detection of automation
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu-sandbox',
        // Stability
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
      ignoreDefaultArgs: [
        '--enable-automation',
        '--enable-blink-features=IdleDetection',
      ],
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
    
    // Generate fingerprint for anti-detection
    const fingerprint = generateFingerprint(getRandomPreset());

    const contextOptions: any = {
      // Bypass CSP to allow our stealth scripts
      bypassCSP: true,
    };

    // Apply viewport (from profile or fingerprint)
    if (networkConfig?.viewport) {
      contextOptions.viewport = networkConfig.viewport;
    } else {
      contextOptions.viewport = { 
        width: fingerprint.screen.width, 
        height: fingerprint.screen.height 
      };
    }

    // Apply user agent (use realistic one if not specified)
    if (networkConfig?.userAgent) {
      contextOptions.userAgent = networkConfig.userAgent;
    } else {
      // Realistic Chrome user agent
      contextOptions.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }

    // Apply locale
    if (networkConfig?.locale) {
      contextOptions.locale = networkConfig.locale;
    } else {
      contextOptions.locale = 'en-US';
    }

    // Apply timezone
    if (networkConfig?.timezone) {
      contextOptions.timezoneId = networkConfig.timezone;
    } else {
      contextOptions.timezoneId = 'America/New_York';
    }

    // Geolocation consistency with timezone
    contextOptions.geolocation = this.getGeolocationForTimezone(contextOptions.timezoneId);
    contextOptions.permissions = ['geolocation'];

    // Apply device scale factor from fingerprint
    contextOptions.deviceScaleFactor = fingerprint.screen.pixelRatio;

    // Color scheme
    contextOptions.colorScheme = 'light';

    // Apply storage state if available
    if (profile.storage_state && Object.keys(profile.storage_state).length > 0) {
      contextOptions.storageState = profile.storage_state;
    }

    const context = await browser.newContext(contextOptions);

    // Apply stealth patches to context
    await applyStealthPatches(context, fingerprint);

    return context;
  }

  private getGeolocationForTimezone(timezone: string): { latitude: number; longitude: number } {
    // Map common timezones to approximate coordinates
    const tzMap: Record<string, { latitude: number; longitude: number }> = {
      'America/New_York': { latitude: 40.7128, longitude: -74.0060 },
      'America/Los_Angeles': { latitude: 34.0522, longitude: -118.2437 },
      'America/Chicago': { latitude: 41.8781, longitude: -87.6298 },
      'Europe/London': { latitude: 51.5074, longitude: -0.1278 },
      'Europe/Paris': { latitude: 48.8566, longitude: 2.3522 },
      'Europe/Berlin': { latitude: 52.5200, longitude: 13.4050 },
      'Europe/Moscow': { latitude: 55.7558, longitude: 37.6173 },
      'Asia/Tokyo': { latitude: 35.6762, longitude: 139.6503 },
      'Asia/Shanghai': { latitude: 31.2304, longitude: 121.4737 },
      'Asia/Singapore': { latitude: 1.3521, longitude: 103.8198 },
      'Australia/Sydney': { latitude: -33.8688, longitude: 151.2093 },
    };

    return tzMap[timezone] || { latitude: 40.7128, longitude: -74.0060 };
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

    // Update current URL
    try {
      await this.api.updateSessionUrl(session.id, page.url());
    } catch (e) {
      // Non-critical
    }

    // Check for captcha before executing step
    const captchaDetection = await detectCaptcha(page);
    if (captchaDetection.detected) {
      log('warning', `Captcha detected: ${captchaDetection.type}`);
      
      // Report captcha status to API
      await this.api.updateCaptchaStatus(session.id, 'detected');
      
      // Attempt to resolve
      await this.api.updateCaptchaStatus(session.id, 'solving');
      const resolveResult = await resolveCaptcha(page, captchaDetection, log);
      
      if (resolveResult.success) {
        log('success', `Captcha resolved via ${resolveResult.method} in ${resolveResult.duration_ms}ms`);
        await this.api.updateCaptchaStatus(session.id, 'solved');
      } else {
        log('error', `Captcha resolution failed: ${resolveResult.error}`);
        await this.api.updateCaptchaStatus(session.id, 'failed');
        throw new Error(`Captcha resolution failed: ${resolveResult.error}`);
      }
    }

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

      // Update URL after step
      try {
        await this.api.updateSessionUrl(session.id, page.url());
      } catch (e) {
        // Non-critical
      }

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
