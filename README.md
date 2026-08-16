# EP Service Bus Explorer

A modern, web-based Azure Service Bus Explorer for development and debugging. Designed specifically for local development with the **Azure Service Bus Emulator** (running in Docker/WSL2), with full support for real Azure Service Bus namespaces.

![Service Bus Explorer](docs/screenshot.png)

## Features

- 🔍 **Auto-discovery** of Azure Service Bus Emulators running in WSL2/Docker
- 📁 **Hierarchical tree view** — queues and topics named with `/` or `\` are rendered as nested folder trees
- 📬 **Queue & Topic browsing** — peek messages, browse DLQ, view scheduled messages
- 📤 **Send messages** — custom body, properties, scheduled delivery
- 🔁 **DLQ Resend** — two-phase safe resend of dead-lettered messages back to the main queue
- 🗑️ **Create / Delete** queues, topics and subscriptions from the UI
- 🌗 **Light / Dark mode** toggle
- ↔️ **Draggable panels** — resize the sidebar and message detail pane by dragging
- 🔄 **Live counts** — active and DLQ message counts update automatically

---

## Architecture

```
D:\code\sbe\
├── src\
│   ├── ServiceBusExplorer.Api\          # ASP.NET Core Minimal API (.NET 10)
│   │   ├── Endpoints\                   # Route handlers grouped by domain
│   │   │   ├── ConnectionEndpoints.cs
│   │   │   ├── DiscoveryEndpoints.cs
│   │   │   ├── EntityEndpoints.cs
│   │   │   └── MessageEndpoints.cs
│   │   └── Program.cs                  # App composition, static file serving, SPA fallback
│   │
│   ├── ServiceBusExplorer.Core\        # Domain models, interfaces, converters
│   │   ├── Models\                     # DTOs (QueueSummary, TopicSummary, etc.)
│   │   ├── Services\                   # IServiceBusExplorerService, IConnectionManager
│   │   └── Converters\                 # FlexibleTimeSpanJsonConverter (handles numeric/string TimeSpan)
│   │
│   ├── ServiceBusExplorer.AzureServiceBus\ # Azure SDK implementation
│   │   ├── Services\                   # ServiceBusExplorerService (real operations)
│   │   └── Extensions\                 # DI registration
│   │
│   ├── ServiceBusExplorer.Discovery\   # WSL2/Docker emulator auto-discovery
│   │   ├── Services\                   # DockerDiscoveryProvider, ConnectionManager
│   │   └── Extensions\
│   │
│   └── ServiceBusExplorer.Web\         # Angular 22 (Zoneless) SPA
│       └── src\app\
│           ├── core\
│           │   ├── models\             # TypeScript interfaces matching API DTOs
│           │   └── services\
│           │       ├── api.service.ts  # HTTP client (all entity names URL-encoded)
│           │       └── state.service.ts
│           └── features\
│               ├── sidebar\            # Tree navigation with folder collapsing
│               │   ├── sidebar.component.ts
│               │   └── sidebar-tree.models.ts   # buildHierarchicalTree() — splits on / and \
│               ├── message-list\       # Tabbed message browser (Active/DLQ/Scheduled)
│               ├── message-detail\     # Message payload and headers viewer
│               └── modals\             # Create/Connect/Send dialogs
│
├── tests\
│   ├── ServiceBusExplorer.Core.Tests\  # xUnit unit tests
│   ├── ServiceBusExplorer.Api.Tests\   # API integration tests
│   └── playwright-e2e\                 # Playwright end-to-end tests
│
├── docker\
│   └── Config.json                     # Service Bus Emulator namespace configuration
│
├── Directory.Build.props               # Global: <UseAppHost>false</UseAppHost> (Windows App Control policy)
├── run.ps1                             # Local dev launcher (see Running Locally)
└── ServiceBusExplorer.slnx            # Solution file
```

---

## Running Locally

### Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- [Node.js 20+](https://nodejs.org/) (for Angular build)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) with WSL2 integration
- Azure Service Bus Emulator (starts automatically via Docker)

### Quick Start

```powershell
.\run.ps1
```

This script:
1. Detects and unblocks `dotnet` files if needed (Windows Application Control policy workaround)
2. Builds the Angular frontend (`ng build --configuration production`)
3. Starts the API at `http://127.0.0.1:5000` (which also serves the Angular SPA)

The API auto-discovers any running Service Bus Emulators in WSL2/Docker on startup.

### Dev Mode (separate servers)

```powershell
.\run.ps1 -Mode Dev
```

- Angular dev server runs at `http://localhost:4200` with hot reload
- API runs at `http://localhost:5000`
- CORS is pre-configured for cross-origin dev

---

## Key Design Decisions

### URL Encoding for Entity Names

Queue and topic names in Azure Service Bus can contain `/` and `\` (used for hierarchy). All API calls in `api.service.ts` use `encodeURIComponent()` on entity names so that `orders/uk/priority` becomes `orders%2Fuk%2Fpriority` in the URL, preventing routing ambiguity.

The API is configured to allow decoded slashes via `AllowEncodedSlashesInUri`.

### Hierarchical Tree Rendering

`sidebar-tree.models.ts` exports `buildHierarchicalTree()` which splits entity names on `/[\/\\]/` to produce a recursive `TreeNode` structure. Folders are collapsible; leaf nodes show message counts and action buttons. Folders aggregate message counts from all descendants.

### TimeSpan Deserialization

`FlexibleTimeSpanJsonConverter` handles both numeric (seconds) and ISO 8601 / `HH:mm:ss` string formats for `TimeSpan` values. This is needed because the Azure Service Bus SDK's `CreateQueueOptions` uses `TimeSpan` but JSON serialization/deserialization defaults can be inconsistent.

### SPA Hosting

The Angular `dist/` output is served directly by the ASP.NET Core API via `PhysicalFileProvider`. Unknown routes fall back to `index.html` (Angular router handles them). The API searches several candidate paths for the `dist/` folder to support both `dotnet run` from the solution root and from the project directory.

### Windows App Control Policy

The project uses `<UseAppHost>false</UseAppHost>` in `Directory.Build.props` to prevent generation of native `.exe` launchers, which are blocked by Windows Application Control policies in some enterprise environments. Instead, the app is launched via `dotnet <dll>`.

---

## Configuration

The emulator configuration lives in `docker/Config.json` — a standard Service Bus Emulator namespace config. The API reads and writes this file to persist queue/topic creation done via the UI.

To connect to a real Azure Service Bus namespace, use the **Add Connection** button in the UI and paste your connection string.

---

## Testing

```powershell
# Unit + integration tests
dotnet test

# E2E tests (requires API running on :5000)
cd tests\playwright-e2e
npx playwright test
```

---

## Agent Quickstart

> For AI agents picking up this project:

1. **Tech stack**: .NET 10 Minimal API + Angular 22 (Zoneless, standalone components, signals)
2. **No zones**: Angular uses `provideZonelessChangeDetection()` — do not use `NgZone` or `ChangeDetectorRef`
3. **State management**: `state.service.ts` uses Angular signals (`signal()`, `computed()`) — no RxJS BehaviorSubjects for state
4. **Routing**: Entity names with `/` must be URL-encoded in Angular service calls; the API accepts `%2F` in path segments
5. **TimeSpan**: Always use `FlexibleTimeSpanJsonConverter` — numeric seconds OR ISO strings are both valid
6. **Build**: `cd src\ServiceBusExplorer.Web && npx ng build` then `dotnet run --project src\ServiceBusExplorer.Api`
7. **Tests**: 25 passing tests across 3 suites (Core, API integration, Playwright E2E)
8. **Windows constraint**: `UseAppHost=false` — never generate `.exe` targets; run via `dotnet <dll>` or `dotnet run`
