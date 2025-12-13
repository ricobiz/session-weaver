import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { Job, Session, ScenarioStep, ActionContext, LogLevel, StorageState } from './types';
import { ApiClient } from './api';
import { getActionHandler } from './actions';
import { log as globalLog, createSessionLogger } from './logger';

export class SessionExecutor {
  private api: ApiClient;
  private headless: boolean;

  constructor(api: ApiClient, headless: boolean = true) {
    this.api = api;
    this.headless = headless;
  }

  async execute(job: Job): Promise<void> {
    const { session, delay_before_start_ms } = job;
    const sessionLog = createSessionLogger(session.id);

    sessionLog('info', `Starting execution for scenario: ${session.scenarios.name}`);
    sessionLog('info', `Profile: ${session.profiles.name} (${session.profiles.email})`);

    // Apply pre-start delay
    if (delay_before_start_ms > 0) {
      sessionLog('debug', `Waiting ${delay_before_start_ms}ms before start`);
      await new Promise(resolve => setTimeout(resolve, delay_before_start_ms));
    }

    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;

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
        'Session initialized',
        0,
        'init'
      );

      // Execute scenario steps
      const steps = session.scenarios.steps;
      const totalSteps = steps.length;

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const progress = Math.round(((i + 1) / totalSteps) * 100);

        await this.executeStep(session, page, context, step, i, sessionLog);

        // Update progress
        await this.api.updateSession(session.id, {
          progress,
          current_step: i + 1,
        });
      }

      // Save storage state back to profile
      await this.saveStorageState(context, session.profiles.id);

      // Mark session as complete
      await this.api.updateSession(session.id, {
        status: 'success',
        progress: 100,
        current_step: totalSteps,
      });

      await this.api.sendLog(
        session.id,
        'success',
        'Session completed successfully',
        totalSteps,
        'complete'
      );

      sessionLog('success', 'Session completed successfully');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      sessionLog('error', `Session failed: ${errorMessage}`);

      await this.api.updateSession(session.id, {
        status: 'error',
        error_message: errorMessage,
      });

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
  }

  private async launchBrowser(session: Session): Promise<Browser> {
    const networkConfig = session.profiles.network_config;
    
    const launchOptions: any = {
      headless: this.headless,
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

      await this.api.sendLog(
        session.id,
        'success',
        `Completed: ${actionName}`,
        stepIndex,
        actionName
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      await this.api.sendLog(
        session.id,
        'error',
        `Failed: ${actionName} - ${errorMessage}`,
        stepIndex,
        actionName
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
