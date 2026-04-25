# Kai Plugin — Cron Scheduler

Schedule recurring tasks with cron expressions in [Kai](https://github.com/LegionIO/kai-desktop). Run shell commands, HTTP requests, or AI agent jobs on a timer with a full audit trail.

## Features

- **Two job types** — Command (shell / HTTP) and AI Agent (prompt + full tool access)
- **Full audit trail** — Every run is recorded with timestamps, duration, stdout/stderr, HTTP responses, or AI transcripts with tool call traces
- **AI tools** — Claude can create, list, update, delete, run, stop, and query history for cron jobs
- **Missed run detection** — Jobs skipped while Kai was closed are marked with a notification on next launch
- **Job kill support** — Stop any running job mid-execution from the UI or via AI tool
- **Per-job overrides** — Model, profile, reasoning effort, and fallback per job
- **Timezone support** — Per-job IANA timezone selection
- **Notifications** — Native and in-app notifications on completion or failure
- **History rotation** — Configurable retention limit with automatic pruning
- **Concurrency guard** — Prevents the same job from running twice simultaneously

## Installation

Install from the Kai marketplace, or manually:

```bash
cd ~/.kai/plugins
git clone https://github.com/LegionIO/kai-plugin-cron.git cron
cd cron
npm install
npm run build
```

Restart Kai — the plugin is discovered automatically.

## Development

```bash
npm install
npm run dev   # builds to ~/.kai/plugins/cron/ and watches for changes
```

Restart Kai after each rebuild to reload the plugin.

```bash
npm run build  # production build → dist/
```

## Project Structure

```
src/
├── backend/
│   ├── index.ts       # activate / deactivate
│   ├── executor.ts    # Job execution (shell, HTTP, AI) with abort
│   ├── scheduler.ts   # Timer-based cron engine with missed-run detection
│   ├── storage.ts     # Job persistence and run history
│   └── tools.ts       # AI tool definitions
├── frontend/
│   ├── index.ts       # Component registration
│   ├── hooks.ts       # Shared prop types
│   └── components/
│       ├── CronPanel.tsx
│       ├── CronSettings.tsx
│       ├── JobList.tsx
│       ├── JobForm.tsx
│       ├── JobDetail.tsx
│       ├── RunHistory.tsx
│       └── ModelProfileSelectors.tsx
└── shared/
    ├── types.ts
    └── constants.ts
```

## AI Tools

| Tool | Description |
|------|-------------|
| `create-cron` | Create a new cron job |
| `list-crons` | List all configured jobs |
| `get-cron` | Get details of a specific job |
| `update-cron` | Update a job's configuration |
| `delete-cron` | Delete a job and its history |
| `get-cron-history` | Query run history |
| `run-cron-now` | Immediately execute a job |
| `stop-cron` | Kill a running job |

## Release

Releases are automated via GitHub Actions. Go to **Actions → Release Plugin → Run workflow**, choose a version bump, and the workflow will build and publish a release with the plugin tarball.

## License

MIT
