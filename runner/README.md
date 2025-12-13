# Session Framework - Playwright Runner

A generic, platform-agnostic execution worker for the Session Framework.

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
│   ├── executor.ts       # Session executor
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

## Extending Actions

Create a new action handler in `src/actions/`:

```typescript
import { ActionHandler } from '../types';

export const myAction: ActionHandler = async (context, step) => {
  const { page, log } = context;
  // Your action logic here
  log('info', 'My action executed');
};
```

Register it in `src/actions/index.ts`.

## License

MIT
