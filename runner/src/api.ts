import { Job, LogLevel, StorageState, SessionUpdate, ResumeMetadata } from './types';
import { log } from './logger';

export interface HealthReport {
  runner_id: string;
  active_sessions: number;
  total_sessions_executed: number;
  total_failures: number;
  uptime_seconds: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  estimated_duration_seconds: number;
  step_breakdown: Array<{
    index: number;
    action: string;
    estimated_seconds: number;
  }>;
}

export class ApiClient {
  private baseUrl: string;
  private runnerId: string;
  private lastRequestTime = 0;
  private minRequestInterval = 100; // ms between requests
  private backoffUntil = 0;
  private backoffMultiplier = 1;

  constructor(baseUrl: string, runnerId: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.runnerId = runnerId;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T | null> {
    const url = `${this.baseUrl}${path}`;
    
    // Rate limiting: wait if we're in backoff period
    const now = Date.now();
    if (now < this.backoffUntil) {
      const waitTime = this.backoffUntil - now;
      log('debug', `Rate limited, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    // Throttle requests
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();
    
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-runner-id': this.runnerId,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (response.status === 204) {
        this.resetBackoff();
        return null;
      }

      // Handle rate limiting (429)
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '5', 10);
        this.backoffMultiplier = Math.min(this.backoffMultiplier * 2, 32);
        this.backoffUntil = Date.now() + (retryAfter * 1000 * this.backoffMultiplier);
        log('warning', `Rate limited (429), backing off for ${retryAfter * this.backoffMultiplier}s`);
        return null;
      }

      if (!response.ok) {
        const error = await response.text();
        log('error', `API error: ${response.status}`, { url, error });
        return null;
      }

      this.resetBackoff();
      return await response.json();
    } catch (error) {
      log('error', `API request failed: ${path}`, { error: String(error) });
      return null;
    }
  }

  private resetBackoff(): void {
    this.backoffMultiplier = 1;
    this.backoffUntil = 0;
  }

  // Poll for next available job
  async claimJob(): Promise<Job | null> {
    return this.request<Job>('GET', '/jobs');
  }

  // Update session status and progress
  async updateSession(
    sessionId: string,
    update: SessionUpdate
  ): Promise<boolean> {
    const result = await this.request('PATCH', `/sessions/${sessionId}`, update);
    return result !== null;
  }

  // Send log entries with optional duration
  async sendLogs(
    sessionId: string,
    logs: Array<{
      level: LogLevel;
      message: string;
      step_index?: number;
      action?: string;
      details?: Record<string, unknown>;
      duration_ms?: number;
    }>
  ): Promise<boolean> {
    const entries = logs.map(log => ({
      session_id: sessionId,
      ...log,
    }));
    const result = await this.request('POST', '/logs', entries);
    return result !== null;
  }

  // Single log entry helper
  async sendLog(
    sessionId: string,
    level: LogLevel,
    message: string,
    stepIndex?: number,
    action?: string,
    details?: Record<string, unknown>,
    durationMs?: number
  ): Promise<void> {
    await this.sendLogs(sessionId, [{
      level,
      message,
      step_index: stepIndex,
      action,
      details,
      duration_ms: durationMs,
    }]);
  }

  // Save profile storage state
  async saveStorageState(
    profileId: string,
    storageState: StorageState
  ): Promise<boolean> {
    const result = await this.request('POST', `/profiles/${profileId}/storage`, storageState);
    return result !== null;
  }

  // Send health report
  async sendHealthReport(report: HealthReport): Promise<boolean> {
    const result = await this.request('POST', '/health', report);
    return result !== null;
  }

  // Validate scenario (dry-run)
  async validateScenario(scenarioId: string): Promise<ValidationResult | null> {
    return this.request<ValidationResult>('POST', `/scenarios/${scenarioId}/validate`);
  }

  // Update resume metadata
  async updateResumeMetadata(
    sessionId: string,
    metadata: ResumeMetadata
  ): Promise<boolean> {
    const result = await this.request('PATCH', `/sessions/${sessionId}`, {
      last_successful_step: metadata.lastSuccessfulStep,
      resume_metadata: metadata,
    });
    return result !== null;
  }

  // Update captcha status
  async updateCaptchaStatus(sessionId: string, status: string): Promise<boolean> {
    const result = await this.request('PATCH', `/sessions/${sessionId}/captcha`, { status });
    return result !== null;
  }

  // Update current URL
  async updateSessionUrl(sessionId: string, url: string): Promise<boolean> {
    const result = await this.request('PATCH', `/sessions/${sessionId}/url`, { url });
    return result !== null;
  }

  // Update profile state
  async updateProfileState(sessionId: string, state: string): Promise<boolean> {
    const result = await this.request('PATCH', `/sessions/${sessionId}/profile-state`, { state });
    return result !== null;
  }
}
