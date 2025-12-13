import 'dotenv/config';
import { hostname } from 'os';
import { RunnerConfig, LogLevel, Job } from './types';
import { ApiClient } from './api';
import { SessionExecutor } from './executor';
import { log, setLogLevel } from './logger';

// Configuration from environment
const config: RunnerConfig = {
  apiBaseUrl: process.env.API_BASE_URL || '',
  runnerId: process.env.RUNNER_ID || `runner-${hostname()}-${process.pid}`,
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '5000', 10),
  maxConcurrency: parseInt(process.env.MAX_CONCURRENCY || '3', 10),
  headless: process.env.HEADLESS !== 'false',
  logLevel: (process.env.LOG_LEVEL || 'info') as LogLevel,
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
const executor = new SessionExecutor(api, config.headless);

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
    executeJob(job).finally(() => {
      activeSessionCount--;
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
    await executor.execute(job);
  } catch (error) {
    log('error', `Job execution failed: ${error}`);
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
  log('info', '═══════════════════════════════════════════════════');
  log('info', 'Starting job polling...');

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
      log('info', 'Received SIGINT, shutting down...');
      isShuttingDown = true;
      
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
      log('info', 'Received SIGTERM, shutting down...');
      isShuttingDown = true;
      resolve();
    });
  });
}

// Run
main().catch((error) => {
  log('error', `Fatal error: ${error}`);
  process.exit(1);
});
