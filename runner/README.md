# Session Framework - Playwright Runner

A generic, platform-agnostic execution worker for the Session Framework.

## Execution Modes

### Autonomous Mode (AI-Driven)
When `execution_mode: "autonomous"` is returned from job claim:
1. Runner receives `goal` instead of fixed steps
2. Takes screenshot → sends to `/agent-executor/decide`
3. AI analyzes and returns next action
4. Runner executes action → reports result
5. Loop continues until AI returns `complete` or `fail`

### Scenario Mode (Fixed Steps)
Traditional mode with predefined step sequence from scenario.

## Requirements

- Node.js 18+
- npm or yarn

## Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API endpoint

# Run the worker
npm start
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `API_BASE_URL` | Session Framework API endpoint | Required |
| `RUNNER_ID` | Unique identifier for this runner | `runner-{hostname}-{pid}` |
| `POLL_INTERVAL_MS` | Job polling interval | `5000` |
| `MAX_CONCURRENCY` | Max parallel browser sessions | `3` |
| `HEADLESS` | Run browsers headless | `true` |
| `LOG_LEVEL` | Logging verbosity | `info` |

## Architecture

```
├── src/
│   ├── index.ts          # Entry point & job poller
│   ├── executor.ts       # Session executor (supports both modes)
│   ├── actions/          # Pluggable action handlers
│   │   ├── index.ts      # Action registry
│   │   ├── open.ts       # Navigate to URL
│   │   ├── play.ts       # Media playback simulation
│   │   ├── scroll.ts     # Page scrolling
│   │   ├── click.ts      # Element clicking
│   │   ├── like.ts       # Like/favorite action
│   │   ├── comment.ts    # Post comment
│   │   └── wait.ts       # Wait/delay
│   ├── api.ts            # API client
│   ├── logger.ts         # Logging utility
│   └── types.ts          # Type definitions
```

## Autonomous Mode API

### Agent Executor Endpoints

**POST /agent-executor/decide**
```json
{
  "session_id": "uuid",
  "task_id": "uuid",
  "goal": "Play a video on YouTube",
  "current_url": "https://youtube.com",
  "screenshot_base64": "...",
  "previous_actions": [...],
  "error": null
}
```

Response:
```json
{
  "action": { "type": "click", "coordinates": { "x": 500, "y": 300 } },
  "reasoning": "Clicking play button in the center of the video",
  "confidence": 0.9,
  "goal_progress": 75,
  "goal_achieved": false
}
```

### Action Types
- `navigate` - Go to URL
- `click` - Click element (by selector or coordinates)
- `type` - Type text
- `scroll` - Scroll page
- `wait` - Wait for timeout
- `screenshot` - Take screenshot for analysis
- `complete` - Goal achieved
- `fail` - Cannot complete goal

## License

MIT
