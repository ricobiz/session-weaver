/**
 * Self-Diagnostics System for Runner
 * Checks all components for health and functionality
 */

import { chromium, Browser } from 'playwright';
import { log } from './logger';
import { ApiClient } from './api';

export interface DiagnosticResult {
  component: string;
  checkType: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  responseTimeMs?: number;
  details?: Record<string, unknown>;
}

export interface DiagnosticsReport {
  timestamp: Date;
  runnerId: string;
  results: DiagnosticResult[];
  overallStatus: 'healthy' | 'degraded' | 'critical';
}

/**
 * Run comprehensive diagnostics
 */
export async function runDiagnostics(
  api: ApiClient,
  runnerId: string
): Promise<DiagnosticsReport> {
  log('info', 'Starting self-diagnostics...');
  
  const results: DiagnosticResult[] = [];
  
  // Check API connectivity
  results.push(await checkApiConnectivity(api));
  
  // Check browser launch
  results.push(await checkBrowserLaunch());
  
  // Check stealth capabilities
  results.push(await checkStealthCapabilities());
  
  // Check network access
  results.push(await checkNetworkAccess());
  
  // Check system resources
  results.push(await checkSystemResources());
  
  // Determine overall status
  const hasErrors = results.some(r => r.status === 'error');
  const hasWarnings = results.some(r => r.status === 'warning');
  const overallStatus = hasErrors ? 'critical' : hasWarnings ? 'degraded' : 'healthy';
  
  const report: DiagnosticsReport = {
    timestamp: new Date(),
    runnerId,
    results,
    overallStatus,
  };
  
  // Report results to API
  try {
    for (const result of results) {
      await api.reportDiagnostic(result);
    }
  } catch (error) {
    log('warning', `Failed to report diagnostics: ${error}`);
  }
  
  log('info', `Diagnostics complete: ${overallStatus}`);
  return report;
}

/**
 * Check API connectivity
 */
async function checkApiConnectivity(api: ApiClient): Promise<DiagnosticResult> {
  const start = Date.now();
  
  try {
    // Try to claim a job (should return null if none available)
    await api.claimJob();
    const responseTime = Date.now() - start;
    
    return {
      component: 'api',
      checkType: 'connectivity',
      status: 'ok',
      message: 'API connection successful',
      responseTimeMs: responseTime,
    };
  } catch (error) {
    return {
      component: 'api',
      checkType: 'connectivity',
      status: 'error',
      message: `API connection failed: ${error}`,
      responseTimeMs: Date.now() - start,
    };
  }
}

/**
 * Check browser launch capability
 */
async function checkBrowserLaunch(): Promise<DiagnosticResult> {
  const start = Date.now();
  let browser: Browser | null = null;
  
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    });
    
    const page = await browser.newPage();
    await page.goto('about:blank');
    await page.close();
    await browser.close();
    browser = null;
    
    return {
      component: 'browser',
      checkType: 'launch',
      status: 'ok',
      message: 'Browser launch successful',
      responseTimeMs: Date.now() - start,
    };
  } catch (error) {
    return {
      component: 'browser',
      checkType: 'launch',
      status: 'error',
      message: `Browser launch failed: ${error}`,
      responseTimeMs: Date.now() - start,
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

/**
 * Check stealth capabilities
 */
async function checkStealthCapabilities(): Promise<DiagnosticResult> {
  let browser: Browser | null = null;
  
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
      ],
      ignoreDefaultArgs: ['--enable-automation'],
    });
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });
    
    const page = await context.newPage();
    await page.goto('about:blank');
    
    // Check webdriver property
    const webdriver = await page.evaluate(() => navigator.webdriver);
    
    await context.close();
    await browser.close();
    browser = null;
    
    if (webdriver === true) {
      return {
        component: 'stealth',
        checkType: 'webdriver',
        status: 'warning',
        message: 'Webdriver flag is exposed (stealth patches may not be fully applied)',
      };
    }
    
    return {
      component: 'stealth',
      checkType: 'capabilities',
      status: 'ok',
      message: 'Stealth capabilities operational',
    };
  } catch (error) {
    return {
      component: 'stealth',
      checkType: 'capabilities',
      status: 'warning',
      message: `Stealth check failed: ${error}`,
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

/**
 * Check network access
 */
async function checkNetworkAccess(): Promise<DiagnosticResult> {
  const start = Date.now();
  
  try {
    const response = await fetch('https://www.google.com', {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000),
    });
    
    return {
      component: 'network',
      checkType: 'internet',
      status: response.ok ? 'ok' : 'warning',
      message: response.ok ? 'Internet access confirmed' : 'Internet access limited',
      responseTimeMs: Date.now() - start,
    };
  } catch (error) {
    return {
      component: 'network',
      checkType: 'internet',
      status: 'error',
      message: `No internet access: ${error}`,
      responseTimeMs: Date.now() - start,
    };
  }
}

/**
 * Check system resources
 */
async function checkSystemResources(): Promise<DiagnosticResult> {
  try {
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const heapPercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
    
    let status: 'ok' | 'warning' | 'error' = 'ok';
    let message = `Memory: ${heapUsedMB}MB / ${heapTotalMB}MB (${heapPercent}%)`;
    
    if (heapPercent > 90) {
      status = 'error';
      message = `High memory usage: ${heapPercent}%`;
    } else if (heapPercent > 75) {
      status = 'warning';
      message = `Elevated memory usage: ${heapPercent}%`;
    }
    
    return {
      component: 'system',
      checkType: 'resources',
      status,
      message,
      details: {
        heapUsedMB,
        heapTotalMB,
        heapPercent,
        rss: Math.round(memUsage.rss / 1024 / 1024),
      },
    };
  } catch (error) {
    return {
      component: 'system',
      checkType: 'resources',
      status: 'warning',
      message: `Resource check failed: ${error}`,
    };
  }
}
