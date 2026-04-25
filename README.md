# Cron Scheduler Plugin for Kai Desktop

Schedule recurring tasks with cron expressions in [Kai Desktop](https://github.com/kai-systems/kai-desktop) — run shell commands, HTTP requests, or AI agent jobs on a timer with full audit history.

## Features

- **Dock Icon & Management Panel** — Clock icon in the sidebar opens a full-page panel for managing all cron jobs
- **Two Job Types:**
  - **Command** — Execute shell commands or HTTP requests on a schedule
  - **AI Agent** — Kick off an AI task with a prompt, system prompt, and full tool access (e.g. "collect the news and send me a summary email")
- **Full Audit Trail** — Every run is recorded with timestamps, duration, and complete output:
  - Shell jobs: stdout, stderr, exit code
  - HTTP jobs: status code, response body, request headers
  - AI jobs: full message transcript, every tool call with args/results/timing, model used
- **AI Tools for CRUD** — The main Kai AI agent can create, list, update, delete, run, stop, and query history for cron jobs via tool calls
- **Missed Run Detection** — If the app was closed when a job was due, it's marked as `skipped` with a notification on next launch
- **Job Kill Support** — Stop any running job (shell, HTTP, or AI) mid-execution from the UI or via AI tool
- **Per-Job Model/Profile Overrides** — Configure model, profile, auto/manual routing, and thinking level at the plugin default level or per individual cron job
- **Cron Expression Display** — Human-readable descriptions of cron schedules (e.g. `0 9 * * 1-5` shows "At 9:00 AM, on weekdays")
- **Timezone Support** — Per-job timezone selection from a comprehensive list of IANA timezones
- **Notifications** — Native macOS and in-app notifications on job completion or failure
- **History Rotation** — Automatic pruning of old run records per configurable retention limit
- **Concurrent Execution Guard** — Prevents the same job from running twice simultaneously

## Prerequisites

- [Kai Desktop](https://github.com/kai-systems/kai-desktop) installed and running

## Installation

1. **Clone this repo** into your plugins directory:

   ```bash
   cd ~/.kai/plugins
   git clone https://github.com/kai-systems/kai-plugin-cron.git cron
   ```

   Or clone elsewhere and symlink:

   ```bash
   git clone https://github.com/kai-systems/kai-plugin-cron.git ~/git/kai-plugin-cron
   ln -sf ~/git/kai-plugin-cron ~/.kai/plugins/cron
   ```

2. **Install dependencies and build:**

   ```bash
   cd ~/.kai/plugins/cron
   npm install
   npm run build
   ```

3. **Restart Kai Desktop** — The plugin will be discovered automatically. Approve it when prompted.

4. **Create your first job** — Click the clock icon in the dock, then click "+ New Job".

## Configuration

### Plugin Settings

Access via Settings > Cron Scheduler:

| Setting | Description | Default |
|---------|-------------|---------|
| Default Model | Model for AI cron jobs | Kai default |
| Default Profile | Profile for AI cron jobs | None |
| Auto/Manual Routing | Fallback model routing mode | Manual |
| Thinking Level | Reasoning effort (low/medium/high/xhigh) | Default |
| Max Records Per Job | Run history retention limit | 100 |
| Command Timeout | Default timeout for shell/HTTP jobs | 60000 ms |

### Per-Job AI Overrides

When creating or editing an AI cron job, you can override the plugin defaults for model, profile, auto/manual routing, and thinking level. Per-job settings take priority over plugin defaults.

### Model/Profile Selector Behavior

- Selecting a non-default profile automatically enables Auto mode and sets the model to that profile's primary model
- Selecting the default profile disables Auto mode
- Auto mode can still be toggled manually
- When Auto mode is ON, the model dropdown is locked to the profile's primary model
- When Auto mode is OFF, the model dropdown is freely selectable

## AI Tools

The plugin registers these tools that Kai's AI agent can call directly in conversation:

| Tool | Description |
|------|-------------|
| `create-cron` | Create a new cron job (command or AI type) |
| `list-crons` | List all configured cron jobs with status |
| `get-cron` | Get full details of a specific job |
| `update-cron` | Update an existing job's configuration |
| `delete-cron` | Delete a job and its history |
| `get-cron-history` | Query run history with optional filters |
| `run-cron-now` | Immediately execute a job |
| `stop-cron` | Kill a currently running job |

**Example:** Ask Kai _"Create a cron job that runs every weekday at 9am and summarizes the top tech news"_ and it will use the `create-cron` tool to set it up.

## Development

```bash
# Watch for changes and rebuild
npm run watch

# After changes, restart Kai Desktop to reload the plugin
# The renderer cache may need clearing:
rm -rf ~/.kai/plugin-renderers/cron
```

### Project Structure

```
plugin.json              # Plugin manifest
main.ts                  # Main process entry point (activate/deactivate)
renderer.js              # Renderer entry (bundled by Kai's esbuild)
src/
  shared/
    types.ts             # All TypeScript types
    constants.ts         # IDs, icons, defaults
  main/
    executor.ts          # Job execution (shell, HTTP, AI) with abort support
    scheduler.ts         # Timer-based cron engine with missed-run detection
    storage.ts           # Job persistence (config) + history (JSON file)
    tools.ts             # AI tool definitions (CRUD + run + stop + history)
  renderer/
    hooks.ts             # React hooks (from host)
    components/
      CronPanel.tsx      # Main panel (list/detail/create/edit views)
      CronSettings.tsx   # Plugin settings page
      JobList.tsx        # Job list with status, next run, actions
      JobForm.tsx        # Create/edit form with model/profile selectors
      JobDetail.tsx      # Job detail view with run history
      RunHistory.tsx     # Expandable run history with full audit details
      ModelProfileSelectors.tsx  # Model/profile/auto-manual/thinking dropdowns
      cronDisplay.ts     # Cron expression to human-readable text
```

## Kai Desktop Framework Changes

This plugin uses the `abortSignal` option on `api.agent.generate()` for killing in-progress AI cron jobs. This requires Kai Desktop with the abort signal threading through `PluginAgentGenerateOptions` → `generateForPlugin` → `streamAgentResponse`.

## License

MIT
