# Horizontal Scaling Guide

## Architecture Overview

The Session Framework uses a distributed execution model where multiple runners can share a single execution queue. Each runner independently polls for jobs and claims them atomically.

```
┌─────────────────────────────────────────────────────────────┐
│                     API Layer (Supabase)                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   Execution Queue                     │   │
│  │  (Atomic job claiming with database-level locking)   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  Runner 1   │      │  Runner 2   │      │  Runner 3   │
│ (3 sessions)│      │ (3 sessions)│      │ (3 sessions)│
└─────────────┘      └─────────────┘      └─────────────┘
```

## Recommended Configuration

### Per-Runner Concurrency

| Use Case | MAX_CONCURRENCY | Memory | CPUs |
|----------|-----------------|--------|------|
| Low-resource | 1-2 | 1GB | 1 |
| Standard | 3-5 | 2GB | 2 |
| High-performance | 5-10 | 4GB | 4 |

**Note:** Each browser context uses ~200-500MB of memory. Set limits accordingly.

### Scaling Guidelines

1. **Horizontal over Vertical**: Prefer multiple runners with lower concurrency over a single high-concurrency runner.

2. **Memory Allocation**: Allocate ~500MB per concurrent session plus 500MB base overhead.

3. **CPU Allocation**: Allocate ~0.5 CPU cores per concurrent session.

4. **Poll Interval**: Keep at 5000ms to avoid API rate limits while maintaining responsiveness.

## Deployment Patterns

### Single Runner
```bash
docker-compose up runner-1
```

### Multiple Runners
```bash
docker-compose --profile scale up
```

### Kubernetes Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: session-runner
spec:
  replicas: 3  # Scale this
  selector:
    matchLabels:
      app: session-runner
  template:
    metadata:
      labels:
        app: session-runner
    spec:
      containers:
      - name: runner
        image: session-runner:latest
        env:
        - name: API_BASE_URL
          valueFrom:
            secretKeyRef:
              name: runner-secrets
              key: api-url
        - name: RUNNER_ID
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        - name: MAX_CONCURRENCY
          value: "3"
        resources:
          limits:
            memory: "2Gi"
            cpu: "2"
          requests:
            memory: "1Gi"
            cpu: "1"
```

## Queue Sharing Behavior

### Job Claiming
- Jobs are claimed atomically using database-level updates
- Each runner can only claim jobs where `claimed_by IS NULL`
- Once claimed, the job is exclusively assigned to that runner

### Concurrency Enforcement
- Each runner tracks its own running sessions
- Global concurrency is the sum of all runner concurrency limits
- The scheduler_config.max_concurrency applies per-runner, not globally

### Priority Handling
- Higher priority jobs are claimed first
- Within same priority, FIFO ordering applies
- Runners do not compete unfairly; first to poll gets the job

## Safe Shutdown

### Graceful Shutdown Process

1. **SIGINT/SIGTERM received**
2. Stop accepting new jobs (stop polling)
3. Wait for in-flight sessions to complete
4. Report final status to API
5. Exit

```bash
# Graceful stop (waits for sessions)
docker-compose stop --timeout 300

# Force stop (interrupts sessions)
docker-compose kill
```

### In-Flight Session Handling

When a runner shuts down:
- In-progress sessions are allowed to complete
- If forcefully terminated, sessions are left in `running` state
- A cleanup job should periodically mark stale `running` sessions as `error`

### Stale Session Recovery

Sessions can become orphaned if a runner crashes. Implement a cleanup cron:

```sql
-- Mark sessions as error if runner hasn't updated in 10 minutes
UPDATE sessions 
SET status = 'error',
    error_message = 'Runner connection lost'
WHERE status = 'running'
  AND updated_at < NOW() - INTERVAL '10 minutes';
```

## Monitoring

### Health Metrics

Each runner reports to the `runner_health` table:
- `last_heartbeat`: Updated on each poll
- `active_sessions`: Current running session count
- `total_sessions_executed`: Lifetime execution count
- `total_failures`: Lifetime failure count
- `uptime_seconds`: Time since runner start

### Alerting Recommendations

1. **Runner Down**: Alert if `last_heartbeat` is > 1 minute old
2. **High Failure Rate**: Alert if `total_failures / total_sessions_executed > 0.1`
3. **Queue Backup**: Alert if queue depth > (total_runners * max_concurrency * 10)

## Performance Tuning

### Network Optimization
- Run runners geographically close to target sites
- Use connection pooling for API calls
- Enable HTTP/2 for Playwright browser connections

### Memory Optimization
- Use `--disable-dev-shm-usage` in Chromium args
- Mount `/dev/shm` as tmpfs with appropriate size
- Enable browser context reuse where possible

### Disk Optimization
- Use fast SSD storage for browser cache
- Clear cache periodically to prevent disk bloat
- Consider RAM disk for temporary files
