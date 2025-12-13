import { ApiClient } from './api';
import { log } from './logger';

export interface HealthState {
  runnerId: string;
  startedAt: Date;
  activeSessions: number;
  totalExecuted: number;
  totalFailures: number;
}

export class HealthReporter {
  private api: ApiClient;
  private state: HealthState;
  private intervalHandle: NodeJS.Timeout | null = null;
  private heartbeatIntervalMs: number;

  constructor(
    api: ApiClient,
    runnerId: string,
    heartbeatIntervalMs: number = 30000
  ) {
    this.api = api;
    this.heartbeatIntervalMs = heartbeatIntervalMs;
    this.state = {
      runnerId,
      startedAt: new Date(),
      activeSessions: 0,
      totalExecuted: 0,
      totalFailures: 0,
    };
  }

  start(): void {
    this.sendHeartbeat();
    this.intervalHandle = setInterval(() => {
      this.sendHeartbeat();
    }, this.heartbeatIntervalMs);
    
    log('debug', `Health reporter started (interval: ${this.heartbeatIntervalMs}ms)`);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    log('debug', 'Health reporter stopped');
  }

  incrementActive(): void {
    this.state.activeSessions++;
  }

  decrementActive(): void {
    this.state.activeSessions = Math.max(0, this.state.activeSessions - 1);
  }

  recordExecution(success: boolean): void {
    this.state.totalExecuted++;
    if (!success) {
      this.state.totalFailures++;
    }
  }

  getState(): HealthState {
    return { ...this.state };
  }

  getUptimeSeconds(): number {
    return Math.floor((Date.now() - this.state.startedAt.getTime()) / 1000);
  }

  private async sendHeartbeat(): Promise<void> {
    try {
      await this.api.sendHealthReport({
        runner_id: this.state.runnerId,
        active_sessions: this.state.activeSessions,
        total_sessions_executed: this.state.totalExecuted,
        total_failures: this.state.totalFailures,
        uptime_seconds: this.getUptimeSeconds(),
      });
      log('debug', 'Heartbeat sent');
    } catch (error) {
      log('warning', `Failed to send heartbeat: ${error}`);
    }
  }
}
