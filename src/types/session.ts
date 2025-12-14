export type SessionStatus = 'idle' | 'queued' | 'running' | 'paused' | 'success' | 'error' | 'cancelled';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  networkConfig: string;
  lastActive: string;
  sessionsRun: number;
}

export interface ScenarioStep {
  action: 'open' | 'play' | 'scroll' | 'like' | 'comment' | 'wait' | 'click';
  target?: string;
  duration?: number;
  text?: string;
  randomized?: boolean;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  steps: ScenarioStep[];
  estimatedDuration: number;
  lastRun?: string;
}

export interface SessionExecution {
  id: string;
  profileId: string;
  profileName: string;
  scenarioId: string;
  scenarioName: string;
  status: SessionStatus;
  progress: number;
  currentStep: number;
  totalSteps: number;
  startTime: string;
  logs: LogEntry[];
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  step?: number;
}

export interface DashboardStats {
  activeSessions: number;
  completedToday: number;
  failedToday: number;
  avgDuration: string;
  totalProfiles: number;
  totalScenarios: number;
}
