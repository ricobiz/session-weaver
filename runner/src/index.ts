import 'dotenv/config';
import { hostname } from 'os';
import { RunnerConfig, LogLevel, Job } from './types';
import { ApiClient } from './api';
import { SessionExecutor, ExecutorConfig } from './executor';
import { log, setLogLevel } from './logger';
import { HealthReporter } from './health';

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

// Validate configuration
if (!config.apiBaseUrl) {
  console.error('ERROR: API_BASE_URL is required');
  console.error('Set it in .env file or as environment variable');
  process.exit(1);
}

// Set log level
setLogLevel(config.logLevel);

// Track active sessions
let activeSessionCount = 0;
let isShuttingDown = false;

// API client
const api = new ApiClient(config.apiBaseUrl, config.runnerId);

// Session executor
const executorConfig: ExecutorConfig = {
  headless: config.headless,
  stepRetryLimit: config.stepRetryLimit,
  sessionRetryLimit: config.sessionRetryLimit,
};
const executor = new SessionExecutor(api, executorConfig);

// Health reporter
const healthReporter = new HealthReporter(api, config.runnerId, 30000);

/**
 * Poll for and execute jobs
 */
async function pollForJobs(): Promise<void> {
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

    log('info', `Claimed job: ${job.job_id}`, {
      session: job.session.id.slice(0, 8),
      scenario: job.session.scenarios.name,
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
 * Execute a job
 */
async function executeJob(job: Job): Promise<void> {
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
  log('info', `API: ${config.apiBaseUrl}`);
  log('info', `Max Concurrency: ${config.maxConcurrency}`);
  log('info', `Poll Interval: ${config.pollIntervalMs}ms`);
  log('info', `Headless: ${config.headless}`);
  log('info', `Step Retry Limit: ${config.stepRetryLimit}`);
  log('info', `Session Retry Limit: ${config.sessionRetryLimit}`);
  log('info', '═══════════════════════════════════════════════════');
  log('info', 'Starting job polling...');

  // Start health reporter
  healthReporter.start();

  // Start polling loop
  const poll = async () => {
    await pollForJobs();
    
    if (!isShuttingDown) {
      setTimeout(poll, config.pollIntervalMs);
    }
  };

  poll();

  // Keep process alive
  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => {
      log('info', 'Received SIGINT, shutting down gracefully...');
      isShuttingDown = true;
      healthReporter.stop();
      
      // Wait for active sessions to complete
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
      healthReporter.stop();
      
      // Wait for active sessions to complete (with timeout)
      let waitCount = 0;
      const maxWait = 60; // 60 seconds max wait
      
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
