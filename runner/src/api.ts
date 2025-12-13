import { Job, LogLevel, StorageState } from './types';
import { log } from './logger';

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
    update: {
      status?: string;
      progress?: number;
      current_step?: number;
      error_message?: string;
    }
  ): Promise<boolean> {
    const result = await this.request('PATCH', `/sessions/${sessionId}`, update);
    return result !== null;
  }

  // Send log entries
  async sendLogs(
    sessionId: string,
    logs: Array<{
      level: LogLevel;
      message: string;
      step_index?: number;
      action?: string;
      details?: Record<string, unknown>;
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
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.sendLogs(sessionId, [{
      level,
      message,
      step_index: stepIndex,
      action,
      details,
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
}
