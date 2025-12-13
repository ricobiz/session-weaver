import { Page, BrowserContext } from 'playwright';

// Scenario step definition
export interface ScenarioStep {
  action: string;
  target?: string;
  duration?: number;
  text?: string;
  randomized?: boolean;
  selector?: string;
}

// Profile with storage state
export interface Profile {
  id: string;
  name: string;
  email: string;
  storage_state: StorageState | null;
  network_config: NetworkConfig | null;
  session_context: Record<string, unknown>;
}

// Playwright storage state format
export interface StorageState {
  cookies?: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
  }>;
  origins?: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
}

// Network configuration
export interface NetworkConfig {
  region?: string;
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
  userAgent?: string;
  viewport?: { width: number; height: number };
  locale?: string;
  timezone?: string;
}

// Scenario definition
export interface Scenario {
  id: string;
  name: string;
  steps: ScenarioStep[];
}

// Session from API
export interface Session {
  id: string;
  profile_id: string;
  scenario_id: string;
  profiles: Profile;
  scenarios: Scenario;
}

// Job from API
export interface Job {
  job_id: string;
  session: Session;
  delay_before_start_ms: number;
}

// Log levels
export type LogLevel = 'debug' | 'info' | 'warning' | 'error' | 'success';

// Log function type
export type LogFunction = (level: LogLevel, message: string, details?: Record<string, unknown>) => void;

// Action execution context
export interface ActionContext {
  page: Page;
  context: BrowserContext;
  session: Session;
  step: ScenarioStep;
  stepIndex: number;
  log: LogFunction;
}

// Action handler function
export type ActionHandler = (context: ActionContext, step: ScenarioStep) => Promise<void>;

// Action registry
export type ActionRegistry = Record<string, ActionHandler>;

// Runner configuration
export interface RunnerConfig {
  apiBaseUrl: string;
  runnerId: string;
  pollIntervalMs: number;
  maxConcurrency: number;
  headless: boolean;
  logLevel: LogLevel;
}
