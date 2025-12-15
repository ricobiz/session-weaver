# Railway Deployment Guide

## Overview

This runner is configured to work on Railway with Playwright in headless mode.

## Prerequisites

- Railway account
- Supabase project with deployed edge functions

## Deployment Steps

### 1. Connect Repository to Railway

1. Go to [Railway](https://railway.app)
2. Create new project
3. Connect your GitHub repository
4. Select the `runner` directory as root

### 2. Configure Environment Variables

In Railway project settings, add these variables:

#### Required Variables

```env
API_BASE_URL=https://[your-project].supabase.co/functions/v1/session-api
```

Replace `[your-project]` with your Supabase project reference ID.

#### Optional Variables

```env
# Runner identification
RUNNER_ID=runner-railway-01

# Job polling interval (milliseconds)
POLL_INTERVAL_MS=5000

# Maximum concurrent browser sessions (adjust based on Railway plan)
MAX_CONCURRENCY=3

# Always use headless mode on Railway
HEADLESS=true

# Log level
LOG_LEVEL=info

# HTTP API port
HTTP_API_PORT=3001
```

### 3. Railway Configuration

The runner uses `nixpacks.toml` for deployment:

- **Build**: Installs dependencies and Playwright Chromium
- **Start**: Runs `npm start` (production mode)
- **Port**: Exposes port 3001 for HTTP API

### 4. Memory & CPU Requirements

Recommended Railway plan settings:
- **Memory**: Minimum 2GB (4GB recommended for MAX_CONCURRENCY=3)
- **CPU**: 2 vCPUs minimum

### 5. Health Check

Railway will automatically check runner health via:
```
GET http://localhost:3001/health
```

Expected response:
```json
{
  "status": "ok",
  "browserActive": true,
  "currentUrl": "..."
}
```

### 6. Verify Deployment

After deployment, check logs for:

```
[INFO] Session Framework Runner
[INFO] Runner ID: runner-railway-01
[INFO] Mode: API + HTTP
[INFO] API: https://[your-project].supabase.co/functions/v1/session-api
[INFO] HTTP API listening on port 3001
```

If you see `[ERROR] API request failed`, verify:
1. API_BASE_URL is correct
2. Supabase edge functions are deployed
3. No CORS issues

## Testing the Deployed Runner

### Via Railway Console

Check runner logs for job polling activity:
```
[INFO] Claimed job: [job_id]
[INFO] Starting execution for scenario: [name]
```

### Via HTTP API (if exposed publicly)

```bash
# Health check
curl https://[your-railway-url]/health

# Test action (navigate)
curl -X POST https://[your-railway-url]/execute \
  -H "Content-Type: application/json" \
  -d '{
    "action": "navigate",
    "url": "https://www.google.com"
  }'
```

## Common Issues

### 1. "fetch failed" errors

**Cause**: API_BASE_URL is incorrect or Supabase functions not deployed

**Solution**:
- Verify API_BASE_URL format
- Deploy Supabase functions
- Check Railway logs for exact error

### 2. Browser crashes

**Cause**: Insufficient memory

**Solution**:
- Increase Railway memory allocation
- Reduce MAX_CONCURRENCY
- Check for memory leaks in automation scripts

### 3. "Target crashed" or "Target closed"

**Cause**: Page crashed during action execution

**Solution**:
- Review action selectors
- Add delays between actions
- Check page console for JavaScript errors

### 4. Jobs not picked up

**Cause**: Runner not polling or no jobs in queue

**Solution**:
- Check runner logs for polling activity
- Verify jobs exist in Supabase database
- Check runner health via /health endpoint

## Scaling

### Horizontal Scaling

Deploy multiple runner instances with different RUNNER_IDs:
```
RUNNER_ID=runner-railway-01
RUNNER_ID=runner-railway-02
RUNNER_ID=runner-railway-03
```

Each runner will claim jobs from the shared queue.

### Vertical Scaling

Increase MAX_CONCURRENCY based on available resources:
- 2GB RAM: MAX_CONCURRENCY=2
- 4GB RAM: MAX_CONCURRENCY=4
- 8GB RAM: MAX_CONCURRENCY=8

**Note**: Each browser instance uses ~300-500MB RAM

## Monitoring

### Railway Metrics

Monitor in Railway dashboard:
- CPU usage
- Memory usage
- Network bandwidth
- Log errors

### Application Metrics

Check via HTTP API:
```bash
# Get logs
curl https://[your-railway-url]/logs

# Get health
curl https://[your-railway-url]/health
```

### Supabase Database

Monitor runner health in `runner_health` table:
- `last_heartbeat` - Should update every 30s
- `active_sessions` - Current concurrent jobs
- `total_sessions_executed` - Completed jobs count

## Support

For issues specific to:
- **Railway deployment**: Check Railway logs
- **Playwright issues**: See runner logs for browser errors
- **Supabase connectivity**: Verify API_BASE_URL and edge functions

## Security Notes

1. Never commit `.env` file to repository
2. Use Railway environment variables for sensitive data
3. Restrict HTTP API access if needed (firewall/auth)
4. Regularly update Playwright version for security patches
