import { LogLevel } from './types';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warning: 2,
  error: 3,
  success: 1,
};

const COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m',   // Gray
  info: '\x1b[36m',    // Cyan
  warning: '\x1b[33m', // Yellow
  error: '\x1b[31m',   // Red
  success: '\x1b[32m', // Green
};

const RESET = '\x1b[0m';

let currentLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) {
    return;
  }

  const timestamp = new Date().toISOString();
  const prefix = `${COLORS[level]}[${timestamp}] [${level.toUpperCase()}]${RESET}`;
  
  if (context) {
    console.log(`${prefix} ${message}`, context);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

export function createSessionLogger(sessionId: string): (level: LogLevel, message: string, details?: Record<string, unknown>) => void {
  return (level: LogLevel, message: string, details?: Record<string, unknown>) => {
    log(level, `[Session:${sessionId.slice(0, 8)}] ${message}`, details);
  };
}
