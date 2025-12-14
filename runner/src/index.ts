import 'dotenv/config';
import { hostname } from 'os';
import { RunnerConfig, LogLevel, Job } from './types';
import { ApiClient } from './api';
import { SessionExecutor, ExecutorConfig } from './executor';
import { log, setLogLevel } from './logger';
import { HealthReporter } from './health';
import { startHttpApi } from './http-api';
// Configuration from environment
const config: RunnerConfig = {
  apiBaseUrl: process.env.API_BASE_URL || '',
  runnerId: process.env.RUNNER_ID || `runner-${hostname()}-${process.pid}`,
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '5000', 10),
  maxConcurrency: parseInt(process.env.MAX_CONCURRENCY || '3', 10),
  headless: process.env.HEADLESS !== 'false',
  logLevel: (process.env.LOG_LEVEL || 'info') as LogLevel,
  stepRetryLimit: parseInt(process.env.STEP_RETRY_LIMIT || '3', 10),
  sessionRetryLimit: parseInt(process.env.SESSION_RETRY_LIMIT || '3', 10),
};

// Note: API_BASE_URL is optional - runner can work in HTTP-only mode for testing
const isApiMode = !!config.apiBaseUrl;

// Set log level
setLogLevel(config.logLevel);

// Track active sessions
let activeSessionCount = 0;
let isShuttingDown = false;

// API client (only if API mode)
const api = isApiMode ? new ApiClient(config.apiBaseUrl, config.runnerId) : null;

// Session executor (only if API mode)
const executorConfig: ExecutorConfig = {
  headless: config.headless,
  stepRetryLimit: config.stepRetryLimit,
  sessionRetryLimit: config.sessionRetryLimit,
};
const executor = isApiMode && api ? new SessionExecutor(api, executorConfig) : null;

// Health reporter (only if API mode)
const healthReporter = isApiMode && api ? new HealthReporter(api, config.runnerId, 30000) : null;

/**
 * Poll for and execute jobs (only in API mode)
 */
async function pollForJobs(): Promise<void> {
  if (!api || !executor || !healthReporter) return;
  if (isShuttingDown) return;
  
  if (activeSessionCount >= config.maxConcurrency) {
    log('debug', `At max concurrency (${activeSessionCount}/${config.maxConcurrency})`);
    return;
  }

  try {
    const job = await api.claimJob();

    if (!job) {
      log('debug', 'No jobs available');
      return;
    }

    const isAutonomous = job.execution_mode === 'autonomous';
    log('info', `Claimed job: ${job.job_id}`, {
      session: job.session.id.slice(0, 8),
      mode: isAutonomous ? 'autonomous' : 'scenario',
      ...(isAutonomous ? { goal: job.autonomous?.goal?.slice(0, 50) } : { scenario: job.session.scenarios?.name }),
    });

    // Execute in background
    activeSessionCount++;
    healthReporter.incrementActive();
    
    executeJob(job).finally(() => {
      activeSessionCount--;
      healthReporter.decrementActive();
    });

  } catch (error) {
    log('error', `Error polling for jobs: ${error}`);
  }
}

/**
 * Execute a job (only in API mode)
 */
async function executeJob(job: Job): Promise<void> {
  if (!executor || !healthReporter) return;
  
  try {
    const result = await executor.execute(job);
    healthReporter.recordExecution(result.success);
  } catch (error) {
    log('error', `Job execution failed: ${error}`);
    healthReporter.recordExecution(false);
  }
}

/**
 * Main loop
 */
async function main(): Promise<void> {
  log('info', '═══════════════════════════════════════════════════');
  log('info', 'Session Framework Runner');
  log('info', '═══════════════════════════════════════════════════');
  log('info', `Runner ID: ${config.runnerId}`);
  log('info', `Mode: ${isApiMode ? 'API + HTTP' : 'HTTP-only (testing)'}`);
  if (isApiMode) {
    log('info', `API: ${config.apiBaseUrl}`);
    log('info', `Max Concurrency: ${config.maxConcurrency}`);
    log('info', `Poll Interval: ${config.pollIntervalMs}ms`);
  }
  log('info', `Headless: ${config.headless}`);
  log('info', '═══════════════════════════════════════════════════');

  // Start HTTP API for direct testing
  const httpPort = parseInt(process.env.HTTP_API_PORT || process.env.PORT || '3001', 10);
  startHttpApi(httpPort);

  // Only start job polling if in API mode
  if (isApiMode && healthReporter) {
    healthReporter.start();
    log('info', 'Starting job polling...');

    const poll = async () => {
      await pollForJobs();
      
      if (!isShuttingDown) {
        setTimeout(poll, config.pollIntervalMs);
      }
    };

    poll();
  } else {
    log('info', 'Running in HTTP-only mode (no job polling)');
  }

  // Keep process alive
  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => {
      log('info', 'Received SIGINT, shutting down gracefully...');
      isShuttingDown = true;
      if (healthReporter) healthReporter.stop();
      
      const checkAndExit = () => {
        if (activeSessionCount === 0) {
          log('info', 'All sessions completed, exiting');
          resolve();
        } else {
          log('info', `Waiting for ${activeSessionCount} active sessions...`);
          setTimeout(checkAndExit, 1000);
        }
      };
      
      checkAndExit();
    });

    process.on('SIGTERM', () => {
      log('info', 'Received SIGTERM, shutting down gracefully...');
      isShuttingDown = true;
      if (healthReporter) healthReporter.stop();
      
      let waitCount = 0;
      const maxWait = 60;
      
      const checkAndExit = () => {
        waitCount++;
        if (activeSessionCount === 0 || waitCount >= maxWait) {
          if (activeSessionCount > 0) {
            log('warning', `Force exiting with ${activeSessionCount} active sessions`);
          }
          log('info', 'Exiting');
          resolve();
        } else {
          log('info', `Waiting for ${activeSessionCount} active sessions... (${waitCount}/${maxWait}s)`);
          setTimeout(checkAndExit, 1000);
        }
      };
      
      checkAndExit();
    });
  });
}

// Run
main().catch((error) => {
  log('error', `Fatal error: ${error}`);
  process.exit(1);
});
