import { Browser, BrowserContext, Page } from 'playwright';
import { Session, LogLevel } from './types';
import { ApiClient } from './api';
import { log as globalLog, createSessionLogger } from './logger';
import { detectCaptcha, resolveCaptcha } from './captcha';
import { TIMEOUTS, LIMITS } from './config';

interface AutonomousConfig {
  agentEndpoint: string;
  maxActions: number;
  verificationEnabled: boolean;
}

interface AgentAction {
  type: 'navigate' | 'click' | 'type' | 'scroll' | 'wait' | 'screenshot' | 'complete' | 'fail' | 'create_bot';
  selector?: string;
  text?: string;
  url?: string;
  direction?: 'up' | 'down';
  amount?: number;
  reason?: string;
  coordinates?: { x: number; y: number };
  expected_changes?: ExpectedChange[];
  bot_config?: any;
}

interface ExpectedChange {
  type: 'url_contains' | 'element_visible' | 'element_hidden' | 'text_appears' | 'network_request' | 'dom_change';
  value: string;
  timeout_ms?: number;
}

interface AgentResponse {
  action: AgentAction;
  actions?: AgentAction[];
  reasoning: string;
  confidence: number;
  goal_progress: number;
  goal_achieved: boolean;
  requires_verification: boolean;
  verification_criteria?: ExpectedChange[];
  generated_data?: Record<string, any>;
}

interface VerificationState {
  url: string;
  visible_elements: string[];
  page_text: string;
}

interface VerificationResult {
  verified: boolean;
  confidence: number;
  results: any[];
}

const DEFAULT_CONFIG: AutonomousConfig = {
  agentEndpoint: '',
  maxActions: LIMITS.MAX_AUTONOMOUS_ACTIONS,
  verificationEnabled: true,
};

export class AutonomousExecutor {
  private api: ApiClient;
  private config: AutonomousConfig;

  constructor(api: ApiClient, config: Partial<AutonomousConfig> = {}) {
    this.api = api;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async execute(
    session: Session,
    goal: string,
    startUrl: string,
    agentEndpoint: string,
    browser: Browser,
    context: BrowserContext,
    page: Page
  ): Promise<{ success: boolean; actionsExecuted: number; verificationScore: number; generatedData?: any }> {
    const sessionLog = createSessionLogger(session.id);
    let actionsExecuted = 0;
    let totalVerificationScore = 0;
    let verifiedActions = 0;
    let generatedData: any = null;
    const networkRequests: { url: string; method: string; timestamp: number }[] = [];
    const MAX_NETWORK_REQUESTS = 100;
    
    // История действий для AI - он должен знать что уже делал!
    const actionHistory: { action: string; coordinates?: { x: number; y: number }; text?: string; url?: string; result: string; urlBefore: string; urlAfter: string }[] = [];

    sessionLog('info', `Starting autonomous execution for goal: ${goal}`);

    // Track network requests with circular buffer
    page.on('request', (request) => {
      if (networkRequests.length >= MAX_NETWORK_REQUESTS) {
        networkRequests.shift(); // Remove oldest
      }
      networkRequests.push({
        url: request.url(),
        method: request.method(),
        timestamp: Date.now(),
      });
    });

    try {
      // Navigate to start URL
      await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.NAVIGATION });
      await this.api.updateSessionUrl(session.id, page.url());

      while (actionsExecuted < this.config.maxActions) {
        // Check for captcha
        const captchaDetection = await detectCaptcha(page);
        if (captchaDetection.detected) {
          sessionLog('warning', `Captcha detected: ${captchaDetection.type}`);
          await this.api.updateCaptchaStatus(session.id, 'detected');
          await this.api.updateCaptchaStatus(session.id, 'solving');
          
          const resolveResult = await resolveCaptcha(page, captchaDetection, sessionLog);
          if (resolveResult.success) {
            sessionLog('success', `Captcha resolved in ${resolveResult.duration_ms}ms`);
            await this.api.updateCaptchaStatus(session.id, 'solved');
          } else {
            sessionLog('error', `Captcha resolution failed`);
            await this.api.updateCaptchaStatus(session.id, 'failed');
          }
        }

        // Capture state before action
        const beforeState = await this.captureState(page);
        const screenshotBefore = await this.captureScreenshot(page);
        const urlBefore = page.url();

        // Get next action from AI agent - передаём историю действий!
        const agentResponse = await this.getNextAction(
          session.id,
          goal,
          urlBefore,
          screenshotBefore,
          agentEndpoint,
          actionHistory
        );

        if (!agentResponse) {
          sessionLog('error', 'Failed to get action from AI agent');
          break;
        }

        // Check if this is a batch response
        const isBatch = Array.isArray(agentResponse.actions) && agentResponse.actions.length > 0;
        const actions = isBatch ? agentResponse.actions : [agentResponse.action];

        if (isBatch) {
          sessionLog('info', `AI Batch: ${actions.length} actions (confidence: ${(agentResponse.confidence * 100).toFixed(0)}%)`);
        } else {
          sessionLog('info', `AI Action ${actionsExecuted + 1}: ${agentResponse.action?.type} (confidence: ${(agentResponse.confidence * 100).toFixed(0)}%)`);
        }
        sessionLog('debug', `Reasoning: ${agentResponse.reasoning}`);

        // Save generated data if present
        if (agentResponse.generated_data) {
          generatedData = agentResponse.generated_data;
          sessionLog('info', `Generated credentials: ${JSON.stringify(generatedData)}`);
        }

        // Check for terminal actions (single action mode)
        if (!isBatch && agentResponse.action?.type === 'complete') {
          sessionLog('success', `Goal achieved: ${agentResponse.action.reason}`);
          
          const avgVerificationScore = verifiedActions > 0 
            ? totalVerificationScore / verifiedActions 
            : 1;
          
          return { 
            success: true, 
            actionsExecuted, 
            verificationScore: avgVerificationScore,
            generatedData
          };
        }

        if (!isBatch && agentResponse.action?.type === 'fail') {
          sessionLog('error', `Goal failed: ${agentResponse.action.reason}`);
          return { 
            success: false, 
            actionsExecuted, 
            verificationScore: verifiedActions > 0 ? totalVerificationScore / verifiedActions : 0 
          };
        }

        // Execute all actions (batch or single)
        let batchSuccess = true;
        let lastError: string | undefined;
        
        for (let i = 0; i < actions.length; i++) {
          const action = actions[i];
          if (!action || !action.type) continue;
          
          if (isBatch) {
            sessionLog('debug', `  [${i + 1}/${actions.length}] ${action.type}${action.text ? `: "${action.text.slice(0, 20)}..."` : ''}`);
          }
          
          const actionResult = await this.executeAction(page, action, sessionLog);
          actionsExecuted++;
          
          // Record in history
          actionHistory.push({
            action: action.type,
            coordinates: action.coordinates,
            text: action.text,
            url: action.url,
            result: actionResult.success ? 'success' : `failed: ${actionResult.error}`,
            urlBefore,
            urlAfter: page.url()
          });
          
          if (!actionResult.success) {
            batchSuccess = false;
            lastError = actionResult.error;
            sessionLog('warning', `Action ${action.type} failed: ${actionResult.error}`);
            break; // Stop batch on first failure
          }
          
          // Small delay between batch actions (but no screenshot!)
          if (i < actions.length - 1) {
            await page.waitForTimeout(200);
          }
        }

        // Wait for page to stabilize AFTER all batch actions
        await page.waitForTimeout(TIMEOUTS.PAGE_STABILIZE);

        // Capture state after ALL actions
        const afterState = await this.captureState(page);
        const screenshotAfter = await this.captureScreenshot(page);
        const urlAfter = page.url();

        // Verify batch if required
        if (agentResponse.requires_verification && this.config.verificationEnabled) {
          const domChanges = this.computeDomChanges(beforeState, afterState);
          const actionType = isBatch ? `batch[${actions.length}]` : (agentResponse.action?.type || 'unknown');
          
          const verificationResult = await this.verifyAction(
            session.id,
            actionsExecuted - 1,
            actionType,
            agentResponse.verification_criteria || [],
            beforeState,
            afterState,
            domChanges,
            beforeState.url !== afterState.url,
            networkRequests.slice(-10),
            agentEndpoint
          );

          if (verificationResult) {
            totalVerificationScore += verificationResult.confidence;
            verifiedActions++;

            if (!verificationResult.verified) {
              sessionLog('warning', `Verification FAILED (${(verificationResult.confidence * 100).toFixed(0)}% confidence)`);
              // Report failed verification to agent
              await this.reportToAgent(
                session.id,
                `${actionType} verification failed`,
                screenshotAfter,
                page.url(),
                'Verification failed - action may not have had expected effect',
                verificationResult,
                agentEndpoint
              );
            } else {
              sessionLog('success', `Verified (${(verificationResult.confidence * 100).toFixed(0)}% confidence)`);
            }
          }
        }

        // Update session URL
        await this.api.updateSessionUrl(session.id, page.url());

        // Network requests are now managed as circular buffer - no cleanup needed

        // Report result and get feedback (every 5 actions or on batch failure)
        if (actionsExecuted % 5 === 0 || !batchSuccess) {
          const screenshot = await this.captureScreenshot(page);
          await this.reportToAgent(
            session.id,
            batchSuccess ? 'completed' : 'failed',
            screenshot,
            page.url(),
            lastError,
            undefined,
            agentEndpoint
          );
        }
      }

      // Max actions reached
      sessionLog('warning', `Maximum actions (${this.config.maxActions}) reached`);
      const avgVerificationScore = verifiedActions > 0 
        ? totalVerificationScore / verifiedActions 
        : 0;
      
      return { 
        success: false, 
        actionsExecuted, 
        verificationScore: avgVerificationScore 
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      sessionLog('error', `Autonomous execution failed: ${errorMessage}`);
      
      const avgVerificationScore = verifiedActions > 0 
        ? totalVerificationScore / verifiedActions 
        : 0;
      
      return { 
        success: false, 
        actionsExecuted, 
        verificationScore: avgVerificationScore 
      };
    }
  }

  private async captureState(page: Page): Promise<VerificationState> {
    try {
      const url = page.url();
      const pageText = await page.evaluate(() => document.body?.innerText?.slice(0, 5000) || '');
      const visibleElements = await page.evaluate(() => {
        const elements: string[] = [];
        document.querySelectorAll('button, a, input, [role="button"]').forEach((el) => {
          if ((el as HTMLElement).offsetParent !== null) {
            const id = el.id ? `#${el.id}` : '';
            const cls = el.className && typeof el.className === 'string' 
              ? `.${el.className.split(' ').slice(0, 2).join('.')}` 
              : '';
            elements.push(`${el.tagName.toLowerCase()}${id}${cls}`);
          }
        });
        return elements.slice(0, 50);
      });

      return { url, visible_elements: visibleElements, page_text: pageText };
    } catch {
      return { url: page.url(), visible_elements: [], page_text: '' };
    }
  }

  private async captureScreenshot(page: Page): Promise<string> {
    try {
      const buffer = await page.screenshot({ type: 'png', fullPage: false });
      return buffer.toString('base64');
    } catch {
      return '';
    }
  }

  private computeDomChanges(before: VerificationState, after: VerificationState): any {
    const beforeSet = new Set(before.visible_elements);
    const afterSet = new Set(after.visible_elements);

    const added = after.visible_elements.filter(e => !beforeSet.has(e));
    const removed = before.visible_elements.filter(e => !afterSet.has(e));

    return { added, removed, modified: [] };
  }

  private async getNextAction(
    sessionId: string,
    goal: string,
    currentUrl: string,
    screenshot: string,
    agentEndpoint: string,
    actionHistory: { action: string; coordinates?: { x: number; y: number }; text?: string; url?: string; result: string; urlBefore: string; urlAfter: string }[] = []
  ): Promise<AgentResponse | null> {
    try {
      // Формируем краткую историю для AI - последние 10 действий
      const recentHistory = actionHistory.slice(-10).map((h, i) => ({
        step: actionHistory.length - 10 + i + 1,
        action: h.action,
        coordinates: h.coordinates,
        text: h.text?.slice(0, 50),
        result: h.result,
        url_changed: h.urlBefore !== h.urlAfter
      }));
      
      const response = await fetch(`${agentEndpoint}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          task_id: '',
          goal,
          current_url: currentUrl,
          screenshot_base64: screenshot,
          previous_actions: recentHistory,
          attempt: actionHistory.length + 1
        }),
      });

      if (!response.ok) {
        globalLog('error', `Agent decide failed: ${response.status}`);
        return null;
      }

      return response.json();
    } catch (error) {
      globalLog('error', `Agent request failed: ${error}`);
      return null;
    }
  }

  private async verifyAction(
    sessionId: string,
    actionIndex: number,
    actionType: string,
    verificationCriteria: ExpectedChange[],
    beforeState: VerificationState,
    afterState: VerificationState,
    domChanges: any,
    urlChanged: boolean,
    networkRequests: any[],
    agentEndpoint: string
  ): Promise<VerificationResult | null> {
    try {
      const response = await fetch(`${agentEndpoint}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          action_index: actionIndex,
          action_type: actionType,
          verification_criteria: verificationCriteria,
          before_state: beforeState,
          after_state: afterState,
          dom_changes: domChanges,
          url_changed: urlChanged,
          network_requests: networkRequests,
        }),
      });

      if (!response.ok) {
        return null;
      }

      return response.json();
    } catch {
      return null;
    }
  }

  private async reportToAgent(
    sessionId: string,
    actionResult: string,
    screenshot: string,
    currentUrl: string,
    error?: string,
    verificationData?: VerificationResult,
    agentEndpoint?: string
  ): Promise<void> {
    if (!agentEndpoint) return;

    try {
      await fetch(`${agentEndpoint}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          action_result: actionResult,
          screenshot_base64: screenshot,
          current_url: currentUrl,
          error,
          verification_data: verificationData,
        }),
      });
    } catch {
      // Non-critical
    }
  }

  private async executeAction(
    page: Page,
    action: AgentAction,
    log: (level: LogLevel, message: string) => void,
    retryCount = 0
  ): Promise<{ success: boolean; error?: string }> {
    const MAX_RETRIES = 2;
    
    try {
      switch (action.type) {
        case 'navigate':
          if (action.url) {
            await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.NAVIGATION });
          }
          break;

        case 'click':
          if (action.coordinates) {
            await page.mouse.click(action.coordinates.x, action.coordinates.y);
          } else if (action.selector) {
            await page.click(action.selector, { timeout: TIMEOUTS.ELEMENT_CLICK });
          }
          break;

        case 'type':
          if (action.text) {
            await page.keyboard.type(action.text, { delay: 50 });
          }
          break;

        case 'scroll':
          const scrollAmount = action.amount || 300;
          const scrollDir = action.direction === 'up' ? -scrollAmount : scrollAmount;
          await page.mouse.wheel(0, scrollDir);
          break;

        case 'wait':
          await page.waitForTimeout(action.amount || 1000);
          break;

        case 'screenshot':
          // Just capture, already handled
          break;

        default:
          log('warning', `Unknown action type: ${action.type}`);
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Retry for recoverable errors (timeout, element not found)
      const isRecoverable = errorMessage.includes('timeout') || 
                           errorMessage.includes('waiting for selector') ||
                           errorMessage.includes('Target closed');
      
      if (isRecoverable && retryCount < MAX_RETRIES) {
        log('warning', `Action ${action.type} failed, retrying (${retryCount + 1}/${MAX_RETRIES}): ${errorMessage}`);
        await page.waitForTimeout(500 * (retryCount + 1)); // Exponential backoff
        return this.executeAction(page, action, log, retryCount + 1);
      }
      
      log('error', `Action ${action.type} failed: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }
}

// ============= Bot Executor for deterministic scenarios =============

export class BotExecutor {
  private api: ApiClient;

  constructor(api: ApiClient) {
    this.api = api;
  }

  async execute(
    session: Session,
    botScenario: any[],
    page: Page,
    log: (level: LogLevel, message: string) => void
  ): Promise<{ success: boolean; stepsCompleted: number; verificationsPassed: number }> {
    let stepsCompleted = 0;
    let verificationsPassed = 0;

    for (let i = 0; i < botScenario.length; i++) {
      const step = botScenario[i];
      
      log('info', `Bot step ${i + 1}/${botScenario.length}: ${step.action}`);

      try {
        // Capture before state
        const urlBefore = page.url();

        // Execute step
        await this.executeStep(page, step);

        // Wait if specified
        if (step.wait_ms) {
          await page.waitForTimeout(step.wait_ms);
        }

        // Verify if expected result defined
        if (step.expected_result) {
          const verified = await this.verifyStep(page, step.expected_result, urlBefore);
          if (verified) {
            verificationsPassed++;
            log('success', `Step ${i + 1} verified`);
          } else {
            log('warning', `Step ${i + 1} verification failed`);
          }
        }

        stepsCompleted++;

        // Update progress
        const progress = Math.round(((i + 1) / botScenario.length) * 100);
        await this.api.updateSession(session.id, { progress, current_step: i + 1 });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log('error', `Bot step ${i + 1} failed: ${errorMessage}`);
        return { success: false, stepsCompleted, verificationsPassed };
      }
    }

    return { success: true, stepsCompleted, verificationsPassed };
  }

  private async executeStep(page: Page, step: any): Promise<void> {
    switch (step.action) {
      case 'navigate':
        await page.goto(step.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        break;

      case 'click':
        await page.click(step.selector, { timeout: 10000 });
        break;

      case 'type':
        if (step.selector) {
          await page.fill(step.selector, step.text);
        } else {
          await page.keyboard.type(step.text, { delay: 30 });
        }
        break;

      case 'scroll':
        await page.mouse.wheel(0, step.amount || 300);
        break;

      case 'wait':
        await page.waitForTimeout(step.wait_ms || 1000);
        break;
    }
  }

  private async verifyStep(page: Page, expected: ExpectedChange, urlBefore: string): Promise<boolean> {
    try {
      switch (expected.type) {
        case 'url_contains':
          return page.url().includes(expected.value);

        case 'element_visible':
          const element = await page.$(expected.value);
          return element !== null && await element.isVisible();

        case 'element_hidden':
          const hiddenElement = await page.$(expected.value);
          return hiddenElement === null || !(await hiddenElement.isVisible());

        case 'text_appears':
          const pageText = await page.evaluate(() => document.body?.innerText || '');
          return pageText.includes(expected.value);

        default:
          return true;
      }
    } catch {
      return false;
    }
  }
}
