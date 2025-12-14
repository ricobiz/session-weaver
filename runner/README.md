# Session Runner

Playwright-based execution engine with autonomous AI agent and bot automation.

## Execution Modes

### 1. Autonomous AI Mode (Full AI Control)
- AI analyzes screenshots and decides actions
- **Strict verification** - every action must prove it worked
- Can create bots from successful executions

### 2. Bot Mode (AI-Generated Automations)
- Deterministic scenarios created by AI
- Runs 1000s of times without AI involvement
- Includes verification for each step

### 3. Legacy Scenario Mode
Traditional fixed step-by-step execution.

## Verification System

Every action requires evidence:
- `url_contains` - URL must contain value
- `element_visible` - Element must appear
- `element_hidden` - Element must disappear  
- `text_appears` - Text must be on page
- `network_request` - API call must occur

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /decide` | Get next AI action with verification criteria |
| `POST /verify` | Verify action completion with evidence |
| `POST /create-bot` | Create automation bot from successful session |
| `POST /execute-bot` | Run bot N times |
| `GET /bots` | List all automation bots |

## Setup

```bash
npm install
cp .env.example .env
npm start
```

## License
MIT
