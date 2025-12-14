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
        return null;
      }

      if (!response.ok) {
        const error = await response.text();
        log('error', `API error: ${response.status}`, { url, error });
        return null;
      }

      return await response.json();
    } catch (error) {
      log('error', `API request failed: ${path}`, { error: String(error) });
      return null;
    }
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
