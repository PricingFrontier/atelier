# Atelier: Full Technical Specification

## Table of Contents

1. [Overview](#1-overview)
2. [System Architecture](#2-system-architecture)
3. [Backend Specification](#3-backend-specification)
4. [Frontend Specification](#4-frontend-specification)
5. [Data Structures & Schemas](#5-data-structures--schemas)
6. [API Contracts](#6-api-contracts)
7. [WebSocket Protocol](#7-websocket-protocol)
8. [UI Component Specification](#8-ui-component-specification)
9. [State Management](#9-state-management)
10. [Code Generation Engine](#10-code-generation-engine)
11. [Error Handling & Recovery](#11-error-handling--recovery)
12. [Chart Specifications](#12-chart-specifications)
13. [Edge Cases & Behavior Matrix](#13-edge-cases--behavior-matrix)
14. [Configuration & Packaging](#14-configuration--packaging)
15. [rustystats API Reference](#15-rustystats-api-reference)

---

## 1. Overview

### 1.1 Product Definition

Atelier is a browser-based Generalized Linear Model (GLM) workbench for actuarial pricing workflows. It wraps the `rustystats` Python library (a high-performance Rust-backed GLM engine) in a modern UI that rivals Willis Towers Watson's Emblem.

### 1.2 Key Design Principles

1. **Code-first transparency**: Every UI action generates visible, runnable Python code. The UI is a visual editor for rustystats scripts.
2. **Emblem-familiar UX**: Actuaries who know Emblem should feel at home — same concepts (factors, relativities, A/E), modernized execution.
3. **Non-blocking iteration**: Model fits run in the background. Users can review previous results, adjust specs, and queue new fits without waiting.
4. **Dense information display**: Charts and tables prioritize information density over whitespace. Actuaries need to see data, not decoration.
5. **Full rustystats coverage**: Every rustystats feature is accessible from the UI — all 8 families, all term types, splines, regularization, target encoding, interactions, constraints.

### 1.3 Distribution Model

```
pip install atelier   # or: uv add atelier
atelier               # starts server, opens browser
atelier --port 9000   # custom port
atelier --no-browser  # server only
```

No Node.js, no Docker, no separate frontend build required by the end user. The React app is pre-built and bundled as static assets inside the Python package.

### 1.4 Target User

Solo actuary or small pricing team (1-5 people). Running locally on a laptop. Data stays on the local machine. No authentication, no multi-tenancy.

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│  BROWSER                                                 │
│  ┌─────────────────────────────────────────────────────┐│
│  │ React 19 + TypeScript + Vite                        ││
│  │ ┌───────────┐ ┌──────────────┐ ┌─────────────────┐ ││
│  │ │ Spec Panel│ │ Results Panel│ │ Code Panel      │ ││
│  │ │ (25%)     │ │ (50%)        │ │ (25%)           │ ││
│  │ │           │ │              │ │                 │ ││
│  │ │ Factor    │ │ Tabbed:      │ │ Monaco Editor   │ ││
│  │ │ config,   │ │ Summary,     │ │ (read-only      │ ││
│  │ │ family,   │ │ Coefficients,│ │ Python)         │ ││
│  │ │ fit opts  │ │ Relativities │ │                 │ ││
│  │ └───────────┘ └──────────────┘ └─────────────────┘ ││
│  │                                                     ││
│  │ State: Zustand stores (spec, fit, results, ui, etc) ││
│  │ Charts: Plotly (analytical), Recharts (widgets)     ││
│  │ Components: shadcn/ui + Tailwind (dark-first)       ││
│  │ Tables: TanStack Table + shadcn Table               ││
│  └─────────────────┬───────────────┬───────────────────┘│
│                    │ REST          │ WebSocket           │
└────────────────────┼───────────────┼────────────────────┘
                     │               │
┌────────────────────┼───────────────┼────────────────────┐
│  PYTHON BACKEND    │               │                     │
│  ┌─────────────────┴───────────────┴───────────────────┐│
│  │ FastAPI + uvicorn                                    ││
│  │                                                     ││
│  │ API Layer:  /api/projects, /api/datasets,           ││
│  │             /api/models, /api/codegen               ││
│  │ WS Layer:   /ws/fit/{model_id}                      ││
│  │                                                     ││
│  │ Services:   project_service, dataset_service,       ││
│  │             model_service, results_service,          ││
│  │             codegen_service, compare_service         ││
│  │                                                     ││
│  │ Core:       fit_runner (background fit + broadcast)  ││
│  │             error mapping (rustystats → suggestions) ││
│  │                                                     ││
│  │ Engine:     rustystats (Rust-backed GLM)             ││
│  │             polars (data I/O)                        ││
│  │             numpy (arrays)                           ││
│  └─────────────────────────────────┬───────────────────┘│
│                                    │                     │
│  ┌─────────────────────────────────┴───────────────────┐│
│  │ STORAGE: ~/.atelier/                                ││
│  │                                                     ││
│  │ atelier.db  (SQLite via aiosqlite)                  ││
│  │   ├── projects table                                ││
│  │   ├── datasets table                                ││
│  │   └── models table (spec, results, model_bytes)     ││
│  │                                                     ││
│  │ projects/                                           ││
│  │   └── {project_id}/                                 ││
│  │       └── datasets/                                 ││
│  │           ├── {dataset_id}.csv                      ││
│  │           └── {dataset_id}.parquet                  ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### 2.2 Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Frontend framework** | React | 19.x | UI rendering |
| **Build tool** | Vite | 6.x | Dev server, bundling |
| **Language** | TypeScript | 5.x | Type safety |
| **UI components** | shadcn/ui | latest | Radix UI + Tailwind primitives |
| **Styling** | Tailwind CSS | 4.x | Utility-first CSS |
| **State** | Zustand | 5.x | Lightweight state management |
| **Charts (primary)** | react-plotly.js + plotly.js-cartesian-dist | 2.6.0 / 2.35.x | Dense analytical charts |
| **Charts (secondary)** | Recharts | 3.7.x | Simple KPI widgets |
| **Data tables** | @tanstack/react-table | 8.21.x | Headless table logic |
| **Code editor** | @monaco-editor/react | 4.7.x | Python syntax, read-only |
| **Resizable panels** | react-resizable-panels | 4.6.x | Three-panel layout (via shadcn) |
| **Theme** | next-themes | 0.4.x | Dark/light mode |
| **WebSocket** | react-use-websocket | 4.9.x | Real-time fit progress |
| **Backend framework** | FastAPI | 0.115.x | Async Python API |
| **ASGI server** | uvicorn | 0.34.x | HTTP + WebSocket serving |
| **ORM** | SQLAlchemy | 2.0.x | Database abstraction |
| **Async SQLite** | aiosqlite | 0.20.x | Non-blocking DB access |
| **Validation** | Pydantic | 2.10.x | Request/response schemas |
| **File upload** | python-multipart | 0.0.18.x | Multipart form parsing |
| **CLI** | Click | 8.x | Command-line interface |
| **GLM engine** | rustystats | 0.3.9+ | Rust-backed GLM fitting |
| **Data I/O** | polars | 1.x | Fast DataFrame operations |

### 2.3 Directory Structure

```
atelier/
├── pyproject.toml                          # Package config + dependencies
├── .python-version                         # 3.13
├── uv.lock                                 # Dependency lock
├── LICENSE
├── README.md
├── .gitignore
│
├── src/
│   └── atelier/
│       ├── __init__.py                     # __version__ = "0.1.0"
│       ├── __main__.py                     # python -m atelier support
│       ├── cli.py                          # Click CLI entry point
│       ├── config.py                       # Path constants, defaults
│       ├── app.py                          # FastAPI app factory
│       │
│       ├── db/
│       │   ├── __init__.py
│       │   ├── engine.py                   # Async SQLite engine + session factory
│       │   ├── models.py                   # SQLAlchemy ORM models
│       │   └── migrations.py              # Schema creation
│       │
│       ├── api/
│       │   ├── __init__.py
│       │   ├── deps.py                     # FastAPI dependencies
│       │   ├── projects.py                 # Project CRUD endpoints
│       │   ├── datasets.py                 # Dataset upload + explore endpoints
│       │   ├── models.py                   # Model fit + results endpoints
│       │   ├── codegen.py                  # Code generation endpoint
│       │   ├── compare.py                  # Model comparison (Phase 2)
│       │   └── ws.py                       # WebSocket handler
│       │
│       ├── schemas/
│       │   ├── __init__.py
│       │   ├── project.py                  # Pydantic project schemas
│       │   ├── dataset.py                  # Pydantic dataset schemas
│       │   ├── model_spec.py               # Pydantic model spec schemas
│       │   ├── results.py                  # Pydantic results schemas
│       │   ├── codegen.py                  # Pydantic codegen schemas
│       │   └── ws.py                       # Pydantic WS message schemas
│       │
│       ├── services/
│       │   ├── __init__.py
│       │   ├── project_service.py          # Project CRUD logic
│       │   ├── dataset_service.py          # File handling, polars read, explore
│       │   ├── model_service.py            # glm_dict + fit orchestration
│       │   ├── results_service.py          # Extract results from GLMModel
│       │   ├── codegen_service.py          # Python script generation
│       │   └── compare_service.py          # Model comparison logic (Phase 2)
│       │
│       ├── core/
│       │   ├── __init__.py
│       │   ├── exceptions.py               # Error mapping + suggestions
│       │   ├── error_handlers.py           # FastAPI exception handlers
│       │   └── fit_runner.py               # Background fit + WS broadcast
│       │
│       └── static/                         # Pre-built React app (Vite output)
│           ├── index.html
│           ├── assets/
│           │   ├── index-[hash].js
│           │   └── index-[hash].css
│           └── favicon.ico
│
├── frontend/
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   ├── vite.config.ts
│   ├── components.json                     # shadcn/ui config
│   ├── index.html
│   │
│   └── src/
│       ├── main.tsx                        # React root + providers
│       ├── App.tsx                         # Top-level router/layout
│       ├── globals.css                     # Tailwind + dark-first CSS vars
│       │
│       ├── lib/
│       │   ├── utils.ts                    # cn() helper
│       │   ├── api.ts                      # Typed fetch wrapper
│       │   └── constants.ts                # Canonical links, family labels, etc.
│       │
│       ├── stores/
│       │   ├── project-store.ts
│       │   ├── spec-store.ts
│       │   ├── fit-store.ts
│       │   ├── results-store.ts
│       │   ├── history-store.ts            # Phase 2
│       │   └── ui-store.ts
│       │
│       ├── components/
│       │   ├── ui/                         # shadcn/ui primitives
│       │   ├── layout/
│       │   │   ├── AppShell.tsx
│       │   │   ├── Header.tsx
│       │   │   ├── SpecPanel.tsx
│       │   │   ├── ResultsPanel.tsx
│       │   │   └── CodePanel.tsx
│       │   ├── project/
│       │   │   ├── ProjectSelector.tsx
│       │   │   └── DataUpload.tsx
│       │   ├── spec/
│       │   │   ├── SpecBuilder.tsx
│       │   │   ├── ResponseConfig.tsx
│       │   │   ├── FactorList.tsx
│       │   │   ├── FactorCard.tsx
│       │   │   ├── TermTypeSelect.tsx
│       │   │   ├── SplineOptions.tsx
│       │   │   ├── TargetEncodingOptions.tsx
│       │   │   ├── ExpressionOptions.tsx
│       │   │   ├── CategoricalOptions.tsx
│       │   │   ├── LinearOptions.tsx
│       │   │   ├── InteractionList.tsx
│       │   │   ├── InteractionCard.tsx
│       │   │   ├── AddFactorDropdown.tsx
│       │   │   ├── AddInteractionDialog.tsx
│       │   │   ├── OffsetWeightConfig.tsx
│       │   │   ├── FitOptionsPanel.tsx
│       │   │   └── FitButton.tsx
│       │   ├── results/
│       │   │   ├── ResultsTabs.tsx
│       │   │   ├── SummaryTab.tsx
│       │   │   ├── CoefficientsTab.tsx
│       │   │   ├── RelativitiesTab.tsx
│       │   │   ├── FactorDrillDown.tsx
│       │   │   ├── DiagnosticsTab.tsx      # Phase 3
│       │   │   ├── LiftTab.tsx             # Phase 3
│       │   │   ├── ResidualsTab.tsx        # Phase 3
│       │   │   ├── ExplorationView.tsx
│       │   │   ├── FitProgressBar.tsx
│       │   │   ├── FitErrorAlert.tsx
│       │   │   └── EmptyResults.tsx
│       │   ├── charts/
│       │   │   ├── RelativityChart.tsx
│       │   │   ├── LiftChart.tsx           # Phase 3
│       │   │   ├── ResidualPlot.tsx        # Phase 3
│       │   │   ├── SplinePlot.tsx          # Phase 3
│       │   │   ├── CalibrationPlot.tsx     # Phase 3
│       │   │   └── chart-theme.ts          # Shared Plotly dark theme config
│       │   ├── code/
│       │   │   ├── CodeEditor.tsx
│       │   │   └── CopyButton.tsx
│       │   └── history/                    # Phase 2
│       │       ├── HistoryList.tsx
│       │       ├── CompareTable.tsx
│       │       ├── CompareDiff.tsx
│       │       └── CompareSideBySide.tsx
│       │
│       └── types/
│           ├── api.ts                      # API response types
│           ├── spec.ts                     # TermSpec, ModelSpec, etc.
│           ├── results.ts                  # CoefRow, RelativityRow, etc.
│           └── ws.ts                       # WebSocket message types
│
└── tests/
    ├── conftest.py                         # Fixtures: test client, temp DB
    ├── test_api/
    │   ├── test_projects.py
    │   ├── test_datasets.py
    │   ├── test_models.py
    │   └── test_codegen.py
    └── test_services/
        ├── test_model_service.py
        ├── test_codegen_service.py
        └── test_dataset_service.py
```

---

## 3. Backend Specification

### 3.1 CLI Entry Point (`cli.py`)

```
Usage: atelier [OPTIONS]

Options:
  --port INTEGER     Port to serve on (default: 8457)
  --host TEXT        Host to bind to (default: 127.0.0.1)
  --no-browser       Don't auto-open browser
  --help             Show this message and exit
```

**Startup sequence:**
1. Call `ensure_data_dir()` — creates `~/.atelier/` and `~/.atelier/projects/` if missing
2. Call `ensure_schema()` — creates SQLite tables if they don't exist
3. If `--no-browser` not set, schedule `webbrowser.open(url)` after 1.5s delay
4. Start uvicorn with the FastAPI app factory

### 3.2 Config (`config.py`)

```python
ATELIER_HOME = Path.home() / ".atelier"
PROJECTS_DIR = ATELIER_HOME / "projects"
DB_PATH = ATELIER_HOME / "atelier.db"
MAX_UPLOAD_SIZE_MB = 500
SUPPORTED_FORMATS = {"csv", "parquet"}
```

### 3.3 FastAPI App (`app.py`)

**Middleware:**
- CORS: allow `http://localhost:5173` (Vite dev server) in development
- No auth (local-only)

**Route registration order:**
1. API routers (prefixed `/api/...`)
2. WebSocket router (prefixed `/ws/...`)
3. Static file mount (`/assets` → `static/assets/`)
4. SPA catch-all (`/{full_path:path}` → `static/index.html`)

The SPA catch-all MUST be registered last so it doesn't intercept API routes.

### 3.4 Database Engine (`db/engine.py`)

- Uses `aiosqlite` for async access
- SQLAlchemy `AsyncSession` with `expire_on_commit=False`
- Singleton session factory pattern
- WAL mode enabled for concurrent reads during background fits

### 3.5 Background Fit Runner (`core/fit_runner.py`)

This is the most complex backend module. It orchestrates model fitting in a background task.

**Architecture:**

```
POST /api/models/{project_id}/fit
  │
  ├── Create Model record (status="pending")
  ├── Return {model_id} immediately (HTTP 202)
  └── asyncio.create_task(run_fit(model_id, dataset_path, spec))
        │
        ├── Set status="fitting"
        ├── Broadcast via WS: {type: "fit_started"}
        ├── Load data (pl.read_csv or pl.read_parquet) in thread
        ├── Build rs.glm_dict(...) in thread
        ├── Call .fit(verbose=True) in thread
        │     └── Capture stdout, parse IRLS iterations
        │           └── Broadcast: {type: "fit_progress", iteration, deviance}
        ├── ON SUCCESS:
        │     ├── Extract: summary(), coef_table(), relativities(), to_bytes()
        │     ├── Generate code via codegen_service
        │     ├── Store all in Model record, status="completed"
        │     └── Broadcast: {type: "fit_completed", summary_metrics}
        └── ON FAILURE:
              ├── Map exception → (error_type, message, suggestion)
              ├── Store in Model record, status="failed"
              └── Broadcast: {type: "fit_failed", error_type, message, suggestion}
```

**In-memory channel registry:**

```python
_fit_channels: dict[str, list[asyncio.Queue]] = {}
```

Each WebSocket connection registers an `asyncio.Queue` for its model_id. The fit runner broadcasts messages to all queues for that model_id. On WebSocket disconnect, the queue is unregistered.

**Thread isolation:**

All rustystats operations (`glm_dict`, `.fit()`, `.summary()`, `.coef_table()`, etc.) run in `asyncio.to_thread()` to avoid blocking the event loop. The event loop is only used for DB operations and WebSocket broadcasts.

**Progress parsing:**

When `verbose=True`, rustystats prints IRLS iteration info to stdout. We capture this by temporarily redirecting `sys.stdout` to a `StringIO` within the thread. After each `.fit()` call, we parse the captured output for lines matching the pattern:
```
Iteration N: deviance = XXXX.XX (change = -YY.YY)
```

Note: Since rustystats uses Rust's println! (not Python print), stdout capture may not work for Rust-level output. In that case, we fall back to sending a single `fit_progress` with `iteration=0` at start and the final result on completion. This is a known limitation to investigate during implementation.

**Fallback for progress**: If stdout capture doesn't work, we send:
1. `fit_started` immediately
2. `fit_completed` or `fit_failed` after the fit returns

The UI handles this gracefully — the progress bar shows an indeterminate spinner if no iteration updates arrive.

---

## 4. Frontend Specification

### 4.1 Theme & Visual Identity

**Dark mode primary.** The default theme is dark. Light mode is available via a toggle in the header.

**CSS Variables (dark default in `:root`):**

```css
:root {
  --background: 0 0% 3.9%;        /* Near-black */
  --foreground: 0 0% 98%;         /* Near-white */
  --card: 0 0% 5.5%;              /* Slightly lighter than bg */
  --card-foreground: 0 0% 98%;
  --popover: 0 0% 5.5%;
  --popover-foreground: 0 0% 98%;
  --primary: 210 100% 52%;        /* Blue accent */
  --primary-foreground: 0 0% 100%;
  --secondary: 0 0% 14.9%;
  --secondary-foreground: 0 0% 98%;
  --muted: 0 0% 14.9%;
  --muted-foreground: 0 0% 63.9%;
  --accent: 0 0% 14.9%;
  --accent-foreground: 0 0% 98%;
  --destructive: 0 62.8% 50.6%;   /* Red for errors */
  --destructive-foreground: 0 0% 98%;
  --border: 0 0% 14.9%;
  --input: 0 0% 14.9%;
  --ring: 210 100% 52%;
  --radius: 0.5rem;

  /* Chart-specific */
  --chart-positive: 142 76% 36%;  /* Green for improvements */
  --chart-negative: 0 62.8% 50.6%; /* Red for regressions */
  --chart-neutral: 210 100% 52%;  /* Blue default */
  --chart-exposure: 45 93% 47%;   /* Amber for exposure overlay */
  --chart-ci: 210 100% 52% / 0.2; /* Transparent blue for CI bands */
  --chart-grid: 0 0% 14.9%;       /* Subtle gridlines */
  --chart-reference: 0 0% 40%;    /* Reference lines (e.g., relativity=1) */
}

.light {
  --background: 0 0% 100%;
  --foreground: 0 0% 3.9%;
  /* ... light overrides */
}
```

**Typography:**
- System font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- Monospace: `"JetBrains Mono", "Fira Code", "Cascadia Code", monospace` (for code panel and summary text)
- Base size: 14px
- Table data: 13px
- Chart labels: 11px

### 4.2 Layout Specification

**Overall structure:**

```
┌──────────────────────────────────────────────────────────┐
│ Header (h=48px, fixed)                                    │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ Logo + "Atelier"  │ Project Name │ Dataset │ Theme ▼ │ │
│ └──────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────┤
│ ┌────────────┬─┬────────────────────┬─┬──────────────┐  │
│ │            │ │                    │ │              │  │
│ │   SPEC     │H│    RESULTS         │H│   CODE       │  │
│ │   PANEL    │A│    PANEL           │A│   PANEL      │  │
│ │   (25%)    │N│    (50%)           │N│   (25%)      │  │
│ │            │D│                    │D│              │  │
│ │            │L│                    │L│              │  │
│ │            │E│                    │E│              │  │
│ │            │ │                    │ │              │  │
│ └────────────┴─┴────────────────────┴─┴──────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Panel constraints:**
- Spec panel: min 15%, max 40%, default 25%
- Results panel: min 30%, no max, default 50%
- Code panel: min 15%, max 40%, default 25%, **collapsible** (double-click handle to collapse/expand)

**Panel persistence:** Panel sizes saved to localStorage (`autoSaveId="atelier-layout"`). Restored on next session.

### 4.3 Application States

The app has these top-level states:

| State | What's shown | Transitions to |
|-------|-------------|----------------|
| **No project** | ProjectSelector (full screen) | → Project selected |
| **No dataset** | AppShell with DataUpload in spec panel, empty results, empty code | → Dataset uploaded |
| **Ready** | AppShell with SpecBuilder, EmptyResults, code with comment | → Fit triggered |
| **Fitting** | AppShell with SpecBuilder (disabled), FitProgressBar, code updating | → Fit complete / failed |
| **Results** | AppShell with SpecBuilder, ResultsTabs, generated code | → New fit / spec change |
| **Fit failed** | AppShell with SpecBuilder, FitErrorAlert in results, code from last spec | → Spec adjusted + refit |

---

## 5. Data Structures & Schemas

### 5.1 SQLAlchemy ORM Models

#### Project

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String(36) | PK, default=uuid4 | Unique identifier |
| name | String(255) | NOT NULL | User-chosen name |
| description | Text | default="" | Optional description |
| created_at | DateTime | default=now | Creation timestamp |
| updated_at | DateTime | default=now, onupdate=now | Last modified |

#### Dataset

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String(36) | PK, default=uuid4 | Unique identifier |
| project_id | String(36) | FK→projects.id, NOT NULL | Parent project |
| name | String(255) | NOT NULL | Original filename |
| file_path | String | NOT NULL | Path relative to project dir |
| file_format | String(10) | NOT NULL | "csv" or "parquet" |
| n_rows | Integer | | Row count |
| n_cols | Integer | | Column count |
| columns | JSON | | Array of column metadata objects |
| uploaded_at | DateTime | default=now | Upload timestamp |
| exploration_json | Text | nullable | Cached explore() JSON |

**`columns` JSON structure:**
```json
[
  {
    "name": "ClaimNb",
    "dtype": "Int64",
    "n_unique": 5,
    "n_missing": 0,
    "min": 0,
    "max": 4,
    "mean": 0.035,
    "is_numeric": true,
    "is_categorical": false,
    "sample_values": [0, 1, 0, 0, 2]
  },
  {
    "name": "Region",
    "dtype": "Utf8",
    "n_unique": 22,
    "n_missing": 0,
    "min": null,
    "max": null,
    "mean": null,
    "is_numeric": false,
    "is_categorical": true,
    "sample_values": ["R11", "R24", "R31", "R52", "R93"]
  }
]
```

#### Model

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String(36) | PK, default=uuid4 | Unique identifier |
| project_id | String(36) | FK→projects.id, NOT NULL | Parent project |
| dataset_id | String(36) | FK→datasets.id, NOT NULL | Training dataset |
| version | Integer | NOT NULL | Auto-increment per project (1, 2, 3...) |
| name | String(255) | default="" | Optional user label |
| created_at | DateTime | default=now | Creation timestamp |
| spec | JSON | NOT NULL | Full ModelSpec as JSON |
| status | String(20) | default="pending" | pending/fitting/completed/failed |
| error_message | Text | nullable | Error description on failure |
| error_type | String(50) | nullable | Exception class name |
| fit_duration_ms | Integer | nullable | Time to fit in milliseconds |
| summary_text | Text | nullable | model.summary() output |
| coef_table_json | Text | nullable | model.coef_table().to_dicts() as JSON |
| relativities_json | Text | nullable | model.relativities().to_dicts() as JSON |
| diagnostics_json | Text | nullable | model.diagnostics_json() |
| deviance | Float | nullable | Model deviance |
| null_deviance | Float | nullable | Null model deviance |
| aic | Float | nullable | Akaike Information Criterion |
| bic | Float | nullable | Bayesian Information Criterion |
| converged | Boolean | nullable | Whether IRLS converged |
| iterations | Integer | nullable | Number of IRLS iterations |
| n_obs | Integer | nullable | Number of observations |
| df_model | Float | nullable | Degrees of freedom (model) |
| df_resid | Float | nullable | Degrees of freedom (residual) |
| model_bytes | LargeBinary | nullable | model.to_bytes() |
| generated_code | Text | nullable | Generated Python script |

### 5.2 Pydantic Schemas

#### TermSpec

```python
class TermSpec(BaseModel):
    type: Literal["categorical", "linear", "bs", "ns",
                  "target_encoding", "frequency_encoding", "expression"]

    # Spline options (bs, ns)
    df: Optional[int] = None                    # Fixed degrees of freedom
    k: Optional[int] = None                     # Penalized basis size (triggers auto-lambda)
    degree: Optional[int] = None                # Spline degree (bs only, default 3)

    # Constraint options (linear, bs, expression)
    monotonicity: Optional[Literal["increasing", "decreasing"]] = None

    # Categorical options
    levels: Optional[list[str]] = None          # Explicit level ordering

    # Target encoding options
    prior_weight: Optional[float] = None        # Shrinkage strength (default 1.0)
    n_permutations: Optional[int] = None        # Variance reduction (default 4)

    # Expression options
    expr: Optional[str] = None                  # e.g., "age ** 2"
```

**Validation rules:**
- `bs`/`ns`: must have either `df` or `k` (not both, not neither)
- `bs`: `degree` in {1, 2, 3}
- `expression`: `expr` is required
- `monotonicity`: only valid for `linear`, `bs`, `expression`
- `prior_weight`: only valid for `target_encoding`

**`to_rustystats_dict()` method:** Strips None values and converts enums to strings. Example output: `{"type": "bs", "df": 5, "monotonicity": "increasing"}`

#### InteractionSpec

```python
class InteractionSpec(BaseModel):
    var1_name: str
    var1_spec: TermSpec                         # Type spec for var1 in this interaction
    var2_name: str
    var2_spec: TermSpec                         # Type spec for var2 in this interaction
    include_main: bool = True                   # Include main effects
    target_encoding: bool = False               # Use TE for this interaction
    frequency_encoding: bool = False            # Use FE for this interaction
    prior_weight: Optional[float] = None        # TE prior weight
    n_permutations: Optional[int] = None        # TE permutations
```

**`to_rustystats_dict()` output:**
```python
{
    "VehAge": {"type": "linear"},
    "Region": {"type": "categorical"},
    "include_main": True,
}
```

#### FitOptions

```python
class FitOptions(BaseModel):
    alpha: float = 0.0                          # Regularization strength
    l1_ratio: float = 0.0                       # Elastic net mixing (0=ridge, 1=lasso)
    max_iter: int = 25                          # Max IRLS iterations
    tol: float = 1e-8                           # Convergence tolerance
    regularization: Optional[Literal["ridge", "lasso", "elastic_net"]] = None
    cv: Optional[int] = None                    # CV folds (default 5 if regularization set)
    selection: Literal["min", "1se"] = "min"    # CV alpha selection strategy
    n_alphas: int = 20                          # Number of alphas in CV path
    seed: Optional[int] = None                  # Random seed
```

#### ModelSpec (the central data structure)

```python
class ModelSpec(BaseModel):
    response: str                               # Response column name
    terms: dict[str, TermSpec]                  # Column name → term config
    interactions: list[InteractionSpec] = []
    family: Literal["gaussian", "poisson", "binomial", "gamma", "tweedie",
                    "quasipoisson", "quasibinomial", "negbinomial"] = "gaussian"
    link: Optional[Literal["identity", "log", "logit", "inverse"]] = None
    var_power: float = 1.5                      # Tweedie variance power
    theta: Optional[float] = None               # NegBin theta (None=estimate)
    offset: Optional[str] = None                # Offset column name
    weights: Optional[str] = None               # Weights column name
    intercept: bool = True
    fit_options: FitOptions = FitOptions()
```

#### FitRequest (what the frontend POSTs)

```python
class FitRequest(BaseModel):
    dataset_id: str
    spec: ModelSpec
    name: Optional[str] = None                  # Optional model label
```

### 5.3 TypeScript Types

#### spec.ts

```typescript
export type TermType =
  | "categorical"
  | "linear"
  | "bs"
  | "ns"
  | "target_encoding"
  | "frequency_encoding"
  | "expression";

export type Monotonicity = "increasing" | "decreasing";

export type Family =
  | "gaussian"
  | "poisson"
  | "binomial"
  | "gamma"
  | "tweedie"
  | "quasipoisson"
  | "quasibinomial"
  | "negbinomial";

export type Link = "identity" | "log" | "logit" | "inverse";

export type RegularizationType = "ridge" | "lasso" | "elastic_net";

export interface TermSpec {
  type: TermType;
  df?: number;
  k?: number;
  degree?: number;
  monotonicity?: Monotonicity;
  levels?: string[];
  prior_weight?: number;
  n_permutations?: number;
  expr?: string;
}

export interface InteractionSpec {
  var1_name: string;
  var1_spec: TermSpec;
  var2_name: string;
  var2_spec: TermSpec;
  include_main: boolean;
  target_encoding: boolean;
  frequency_encoding: boolean;
  prior_weight?: number;
  n_permutations?: number;
}

export interface FitOptions {
  alpha: number;
  l1_ratio: number;
  max_iter: number;
  tol: number;
  regularization: RegularizationType | null;
  cv: number | null;
  selection: "min" | "1se";
  n_alphas: number;
  seed: number | null;
}

export interface ModelSpec {
  response: string;
  terms: Record<string, TermSpec>;
  interactions: InteractionSpec[];
  family: Family;
  link: Link | null;
  var_power: number;
  theta: number | null;
  offset: string | null;
  weights: string | null;
  intercept: boolean;
  fit_options: FitOptions;
}

// Canonical link mapping (used by ResponseConfig to set default link)
export const CANONICAL_LINKS: Record<Family, Link> = {
  gaussian: "identity",
  poisson: "log",
  binomial: "logit",
  gamma: "log",
  tweedie: "log",
  quasipoisson: "log",
  quasibinomial: "logit",
  negbinomial: "log",
};

// Human-readable family labels
export const FAMILY_LABELS: Record<Family, string> = {
  gaussian: "Gaussian (Normal)",
  poisson: "Poisson",
  binomial: "Binomial",
  gamma: "Gamma",
  tweedie: "Tweedie",
  quasipoisson: "Quasi-Poisson",
  quasibinomial: "Quasi-Binomial",
  negbinomial: "Negative Binomial",
};

// Term type labels and descriptions
export const TERM_TYPE_INFO: Record<TermType, { label: string; description: string }> = {
  categorical: { label: "Categorical", description: "One coefficient per level (dummy encoding)" },
  linear: { label: "Linear", description: "Single coefficient, continuous effect" },
  bs: { label: "B-Spline", description: "Flexible smooth curve (B-spline basis)" },
  ns: { label: "Natural Spline", description: "Smooth curve, linear at boundaries" },
  target_encoding: { label: "Target Encoding", description: "CatBoost-style ordered target statistics" },
  frequency_encoding: { label: "Frequency Encoding", description: "Category encoded by relative frequency" },
  expression: { label: "Expression", description: "Arithmetic transformation (e.g., x^2)" },
};
```

#### results.ts

```typescript
export interface CoefRow {
  feature: string;
  estimate: number;
  std_error: number;
  z_value: number;
  p_value: number;
  significance: string;        // "***", "**", "*", ".", ""
  ci_lower: number;
  ci_upper: number;
  factor_name: string;         // The parent factor (e.g., "Region" for "Region[T.R24]")
}

export interface RelativityRow {
  feature: string;
  relativity: number;
  ci_lower: number;
  ci_upper: number;
  factor_name: string;
}

export interface ModelResult {
  model_id: string;
  version: number;
  name: string;
  status: "pending" | "fitting" | "completed" | "failed";
  created_at: string;
  spec: ModelSpec;

  // Populated on completion
  deviance: number | null;
  null_deviance: number | null;
  aic: number | null;
  bic: number | null;
  converged: boolean | null;
  iterations: number | null;
  n_obs: number | null;
  df_model: number | null;
  df_resid: number | null;
  fit_duration_ms: number | null;

  // Error info (on failure)
  error_type: string | null;
  error_message: string | null;
}

export interface ModelSummary {
  model_id: string;
  version: number;
  name: string;
  status: string;
  created_at: string;
  family: string;
  n_terms: number;
  deviance: number | null;
  aic: number | null;
  bic: number | null;
  converged: boolean | null;
  iterations: number | null;
  fit_duration_ms: number | null;
  error_type: string | null;
}

export interface FitProgress {
  iteration: number;
  max_iter: number;
  deviance: number;
  deviance_change: number | null;
}

export interface DatasetColumn {
  name: string;
  dtype: string;
  n_unique: number;
  n_missing: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  is_numeric: boolean;
  is_categorical: boolean;
  sample_values: any[];
}

export interface Dataset {
  id: string;
  project_id: string;
  name: string;
  file_format: string;
  n_rows: number;
  n_cols: number;
  columns: DatasetColumn[];
  uploaded_at: string;
  has_exploration: boolean;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  datasets: Dataset[];
  model_count: number;
}
```

#### ws.ts

```typescript
export type ServerMessage =
  | { type: "fit_started"; model_id: string; timestamp: string }
  | { type: "fit_progress"; model_id: string; iteration: number; max_iter: number;
      deviance: number; deviance_change: number | null }
  | { type: "fit_completed"; model_id: string; duration_ms: number;
      summary: { deviance: number; aic: number; converged: boolean; iterations: number } }
  | { type: "fit_failed"; model_id: string; error_type: string;
      error_message: string; suggestion: string | null };

export type ClientMessage =
  | { type: "cancel" }
  | { type: "ping" };
```

---

## 6. API Contracts

### 6.1 Projects

#### `POST /api/projects`

**Request:**
```json
{ "name": "Motor Frequency 2024", "description": "French MTPL frequency model" }
```

**Response (201):**
```json
{
  "id": "a1b2c3d4-...",
  "name": "Motor Frequency 2024",
  "description": "French MTPL frequency model",
  "created_at": "2026-02-08T14:30:00Z",
  "updated_at": "2026-02-08T14:30:00Z",
  "datasets": [],
  "model_count": 0
}
```

#### `GET /api/projects`

**Response (200):**
```json
[
  {
    "id": "a1b2c3d4-...",
    "name": "Motor Frequency 2024",
    "updated_at": "2026-02-08T14:30:00Z",
    "model_count": 5
  }
]
```

#### `GET /api/projects/{project_id}`

**Response (200):** Full project with datasets and model count (same as POST response).

#### `PATCH /api/projects/{project_id}`

**Request:** `{ "name": "New Name" }` or `{ "description": "New desc" }`

**Response (200):** Updated project.

#### `DELETE /api/projects/{project_id}`

**Response (204):** No content. Deletes project, all datasets (files + records), all models.

### 6.2 Datasets

#### `POST /api/datasets/{project_id}/upload`

**Request:** `multipart/form-data` with field `file` (CSV or Parquet).

**Response (201):**
```json
{
  "id": "d5e6f7g8-...",
  "project_id": "a1b2c3d4-...",
  "name": "freMTPL2freq.csv",
  "file_format": "csv",
  "n_rows": 678013,
  "n_cols": 12,
  "columns": [
    {
      "name": "IDpol",
      "dtype": "Int64",
      "n_unique": 678013,
      "n_missing": 0,
      "min": 1,
      "max": 6114857,
      "mean": 3060310.5,
      "is_numeric": true,
      "is_categorical": false,
      "sample_values": [1, 3, 5, 10, 11]
    },
    {
      "name": "ClaimNb",
      "dtype": "Int64",
      "n_unique": 5,
      "n_missing": 0,
      "min": 0,
      "max": 4,
      "mean": 0.035,
      "is_numeric": true,
      "is_categorical": false,
      "sample_values": [0, 1, 0, 0, 2]
    },
    {
      "name": "Region",
      "dtype": "Utf8",
      "n_unique": 22,
      "n_missing": 0,
      "min": null,
      "max": null,
      "mean": null,
      "is_numeric": false,
      "is_categorical": true,
      "sample_values": ["R11", "R24", "R31", "R52", "R93"]
    }
  ],
  "uploaded_at": "2026-02-08T14:31:00Z",
  "has_exploration": false
}
```

**Error (400):** `{"error_type": "ValidationError", "message": "Unsupported file format: .xlsx"}`
**Error (413):** `{"error_type": "ValidationError", "message": "File exceeds 500MB limit"}`

#### `GET /api/datasets/{dataset_id}/preview`

**Query params:** `offset` (default 0), `limit` (default 100, max 1000)

**Response (200):**
```json
{
  "columns": ["IDpol", "ClaimNb", "Exposure", "VehAge", "Region"],
  "rows": [
    [1, 0, 0.76, 0, "R82"],
    [3, 1, 0.09, 0, "R22"],
    ...
  ],
  "total_rows": 678013,
  "offset": 0,
  "limit": 100
}
```

#### `POST /api/datasets/{dataset_id}/explore`

**Request:**
```json
{
  "response": "ClaimNb",
  "categorical_factors": ["Region", "Area", "VehBrand"],
  "continuous_factors": ["VehAge", "DrivAge", "BonusMalus", "Density"],
  "offset": "Exposure"
}
```

**Response (200):** The raw `DataExploration.to_json()` output from rustystats (deeply nested). Also cached in `Dataset.exploration_json`.

#### `GET /api/datasets/{dataset_id}/exploration`

Returns the cached exploration JSON, or 404 if not yet computed.

### 6.3 Models

#### `POST /api/models/{project_id}/fit`

**Request:**
```json
{
  "dataset_id": "d5e6f7g8-...",
  "name": "Frequency v1 - base",
  "spec": {
    "response": "ClaimNb",
    "terms": {
      "VehAge": { "type": "linear" },
      "DrivAge": { "type": "bs", "df": 5 },
      "BonusMalus": { "type": "linear", "monotonicity": "increasing" },
      "Region": { "type": "categorical" },
      "Area": { "type": "categorical" },
      "VehBrand": { "type": "target_encoding", "prior_weight": 1.0 },
      "Density": { "type": "ns", "df": 4 }
    },
    "interactions": [
      {
        "var1_name": "VehAge",
        "var1_spec": { "type": "linear" },
        "var2_name": "Region",
        "var2_spec": { "type": "categorical" },
        "include_main": true,
        "target_encoding": false,
        "frequency_encoding": false
      }
    ],
    "family": "poisson",
    "link": null,
    "offset": "Exposure",
    "weights": null,
    "intercept": true,
    "fit_options": {
      "alpha": 0.0,
      "l1_ratio": 0.0,
      "max_iter": 25,
      "tol": 1e-8,
      "regularization": null,
      "cv": null,
      "selection": "min",
      "seed": 42
    }
  }
}
```

**Response (202):**
```json
{
  "model_id": "m9n0o1p2-...",
  "version": 1,
  "status": "pending"
}
```

#### `GET /api/models/{model_id}`

**Response (200):** Full ModelResult (see TypeScript type above).

#### `GET /api/models/{model_id}/summary`

**Response (200):**
```json
{
  "summary": "                 Generalized Linear Model Regression Results\n==============================================================================\nDep. Variable:                ClaimNb   No. Observations:               678013\nModel:                            GLM   Df Residuals:                 677990.0\nFamily:                       Poisson   Df Model:                         22.0\nLink:                             Log   Deviance:                    132810.57\n..."
}
```

#### `GET /api/models/{model_id}/coefficients`

**Response (200):**
```json
{
  "coefficients": [
    {
      "feature": "Intercept",
      "estimate": -2.8761,
      "std_error": 0.0312,
      "z_value": -92.18,
      "p_value": 0.0,
      "significance": "***",
      "ci_lower": -2.9373,
      "ci_upper": -2.8149,
      "factor_name": "Intercept"
    },
    {
      "feature": "VehAge",
      "estimate": -0.0234,
      "std_error": 0.0015,
      "z_value": -15.60,
      "p_value": 0.0,
      "significance": "***",
      "ci_lower": -0.0263,
      "ci_upper": -0.0205,
      "factor_name": "VehAge"
    },
    {
      "feature": "Region[T.R24]",
      "estimate": 0.1456,
      "std_error": 0.0287,
      "z_value": 5.07,
      "p_value": 3.96e-7,
      "significance": "***",
      "ci_lower": 0.0893,
      "ci_upper": 0.2019,
      "factor_name": "Region"
    }
  ]
}
```

**Note on `factor_name` extraction:** The backend parses `feature_names` from rustystats and extracts the parent factor name:
- `"Intercept"` → factor_name = `"Intercept"`
- `"VehAge"` → factor_name = `"VehAge"`
- `"Region[T.R24]"` → factor_name = `"Region"`
- `"bs(DrivAge, 1/5)"` → factor_name = `"DrivAge"`
- `"TE(VehBrand)"` → factor_name = `"VehBrand"`
- `"VehAge:Region[T.R24]"` → factor_name = `"VehAge:Region"` (interaction)

This parsing is done in `results_service.py` and enables the frontend to group coefficients by factor.

#### `GET /api/models/{model_id}/relativities`

**Response (200):**
```json
{
  "relativities": [
    {
      "feature": "VehAge",
      "relativity": 0.9769,
      "ci_lower": 0.9741,
      "ci_upper": 0.9797,
      "factor_name": "VehAge"
    },
    {
      "feature": "Region[T.R24]",
      "relativity": 1.1567,
      "ci_lower": 1.0934,
      "ci_upper": 1.2238,
      "factor_name": "Region"
    }
  ]
}
```

Only available for log-link models. Returns 404 with suggestion for non-log-link models.

#### `GET /api/models/{model_id}/diagnostics`

Returns the full diagnostics JSON from `model.diagnostics_json(train_data)`. This is a large, deeply nested object.

#### `POST /api/models/{model_id}/diagnostics`

Triggers diagnostics computation (or re-computation with different options).

**Request:**
```json
{
  "compute_vif": true,
  "compute_coefficients": true,
  "compute_deviance_by_level": true,
  "compute_lift": true,
  "compute_partial_dep": true,
  "n_calibration_bins": 10,
  "n_factor_bins": 10,
  "test_dataset_id": null
}
```

**Response (200):** Updated diagnostics JSON.

#### `GET /api/models/{project_id}/history`

**Response (200):**
```json
[
  {
    "model_id": "m9n0o1p2-...",
    "version": 3,
    "name": "Added spline on DrivAge",
    "status": "completed",
    "created_at": "2026-02-08T15:00:00Z",
    "family": "poisson",
    "n_terms": 7,
    "deviance": 132810.57,
    "aic": 132856.57,
    "bic": 133113.21,
    "converged": true,
    "iterations": 6,
    "fit_duration_ms": 1230,
    "error_type": null
  },
  {
    "model_id": "q3r4s5t6-...",
    "version": 2,
    "name": "",
    "status": "completed",
    "created_at": "2026-02-08T14:55:00Z",
    "family": "poisson",
    "n_terms": 5,
    "deviance": 133500.12,
    "aic": 133512.12,
    "bic": 133582.45,
    "converged": true,
    "iterations": 5,
    "fit_duration_ms": 890,
    "error_type": null
  }
]
```

Ordered by version descending (newest first).

### 6.4 Code Generation

#### `POST /api/codegen/generate`

**Request:** `ModelSpec` JSON (same as in FitRequest.spec)

**Response (200):**
```json
{
  "code": "import polars as pl\nimport rustystats as rs\n\n# Load your data\ndata = pl.read_csv(\"your_data.csv\")  # adjust path and format\n\n# Model specification\nterms = {\n    \"VehAge\": {\"type\": \"linear\"},\n    \"DrivAge\": {\"type\": \"bs\", \"df\": 5},\n    ...\n}\n\nmodel = rs.glm_dict(\n    response=\"ClaimNb\",\n    terms=terms,\n    data=data,\n    family=\"poisson\",\n    offset=\"Exposure\",\n)\n\nresult = model.fit()\nprint(result.summary())\n"
}
```

#### `GET /api/codegen/{model_id}`

Returns the stored generated code for a completed model.

---

## 7. WebSocket Protocol

### 7.1 Connection

**URL:** `ws://localhost:8457/ws/fit/{model_id}`

**Lifecycle:**
1. Frontend opens connection after receiving `model_id` from `POST /api/models/{project_id}/fit`
2. Server accepts connection and registers a listener queue for this model_id
3. Server pushes messages as the fit progresses
4. Connection closes after `fit_completed` or `fit_failed`
5. Frontend can also close (e.g., user navigates away) — fit continues in background

### 7.2 Message Types (Server → Client)

#### fit_started
```json
{
  "type": "fit_started",
  "model_id": "m9n0o1p2-...",
  "timestamp": "2026-02-08T14:35:00Z"
}
```
Sent when the background task begins executing.

#### fit_progress
```json
{
  "type": "fit_progress",
  "model_id": "m9n0o1p2-...",
  "iteration": 3,
  "max_iter": 25,
  "deviance": 135200.45,
  "deviance_change": -1500.32
}
```
Sent after each IRLS iteration (if stdout capture works). If capture doesn't work, this message may not be sent — the frontend shows an indeterminate spinner.

#### fit_completed
```json
{
  "type": "fit_completed",
  "model_id": "m9n0o1p2-...",
  "duration_ms": 1230,
  "summary": {
    "deviance": 132810.57,
    "aic": 132856.57,
    "converged": true,
    "iterations": 6
  }
}
```

#### fit_failed
```json
{
  "type": "fit_failed",
  "model_id": "m9n0o1p2-...",
  "error_type": "ConvergenceError",
  "error_message": "Model did not converge after 25 iterations. Final deviance change: 0.52",
  "suggestion": "Try increasing max_iter to 50+, loosening tol (e.g., 1e-6), or simplifying the model (remove terms with many levels or high-df splines)."
}
```

### 7.3 Message Types (Client → Server)

#### cancel (future enhancement)
```json
{ "type": "cancel" }
```
Not implemented in Phase 1. Fit runs to completion.

---

## 8. UI Component Specification

### 8.1 Header

**Height:** 48px, fixed at top.

**Contents (left to right):**
1. Logo/wordmark: "Atelier" in medium weight
2. Separator
3. Project name (editable on click → inline text input)
4. Separator
5. Dataset indicator: filename + row count badge (e.g., "freMTPL2freq.csv · 678K rows")
6. Flex spacer
7. Fit status badge: idle (gray) / fitting (blue pulse) / completed (green) / failed (red)
8. Theme toggle button (sun/moon icon)

### 8.2 Spec Panel (Left)

**Sections (top to bottom, scrollable):**

#### 8.2.1 Data Upload (shown when no dataset)

- Drag-and-drop zone with dashed border
- Text: "Drop CSV or Parquet file" + "or click to browse"
- `<input type="file" accept=".csv,.parquet">`
- On upload: shows progress bar → transitions to column list
- On error: red alert with message

#### 8.2.2 Response Config

- **Response column:** Dropdown (`<Select>`) populated from dataset columns. Numeric columns shown first. Shows dtype badge next to each option.
- **Family:** Dropdown. Options: Gaussian, Poisson, Binomial, Gamma, Tweedie, Quasi-Poisson, Quasi-Binomial, Negative Binomial. Each option shows a brief description on hover.
- **Link:** Dropdown. Auto-populated with canonical link when family changes. Shows "(canonical)" next to the default. Can be overridden.
- **Tweedie var_power:** Number input, only shown when family=tweedie. Default 1.5, range [1, 2].
- **NegBin theta:** Number input or "Auto" toggle, only shown when family=negbinomial.

**Behavior:**
- When family changes → link resets to canonical default
- When response changes → if it was used as offset/weights, clear that reference

#### 8.2.3 Offset & Weights Config

- **Offset:** Dropdown (dataset columns) + "None" option. Only numeric columns shown. Shows a tooltip: "Fixed additive term in the linear predictor (e.g., log(Exposure) for frequency models)"
- **Weights:** Dropdown (dataset columns) + "None" option. Only numeric columns shown. Tooltip: "Observation-level prior weights"

#### 8.2.4 Factor List

A scrollable list of added terms. Each item is a **FactorCard**.

**FactorCard layout:**
```
┌─────────────────────────────────────────────┐
│ ┌──────┐                                    │
│ │ ≡    │  VehAge            [linear] [×]    │
│ └──────┘                                    │
│   └ Monotonicity: increasing                │
└─────────────────────────────────────────────┘
```

- Drag handle (≡) on left (reordering is cosmetic)
- Column name (bold)
- Term type badge (colored: categorical=purple, linear=blue, bs=green, ns=teal, TE=orange, FE=yellow, expr=gray)
- Delete button (×) on right
- Expandable detail row showing configured options
- Click card to expand inline config OR click to open a popover/dialog

**FactorCard expanded (inline config):**
```
┌─────────────────────────────────────────────┐
│ VehAge                       [linear] [×]   │
├─────────────────────────────────────────────┤
│ Type: [linear ▼]                            │
│ Monotonicity: [none ▼] / [increasing ▼] /  │
│               [decreasing ▼]                │
└─────────────────────────────────────────────┘
```

**For B-spline (bs) type:**
```
┌─────────────────────────────────────────────┐
│ DrivAge                         [bs] [×]    │
├─────────────────────────────────────────────┤
│ Type: [B-Spline ▼]                          │
│ Mode: ( ) Fixed df  ( ) Penalized (auto λ)  │
│ df: [5]       degree: [3]                   │
│ Monotonicity: [none ▼]                      │
└─────────────────────────────────────────────┘
```

If "Penalized" mode: shows `k` input instead of `df`, and `degree` still available.

**For target_encoding type:**
```
┌─────────────────────────────────────────────┐
│ VehBrand                        [TE] [×]    │
├─────────────────────────────────────────────┤
│ Type: [Target Encoding ▼]                   │
│ Prior weight: [1.0]                         │
└─────────────────────────────────────────────┘
```

**For expression type:**
```
┌─────────────────────────────────────────────┐
│ BMI                           [expr] [×]    │
├─────────────────────────────────────────────┤
│ Type: [Expression ▼]                        │
│ Expression: [weight / (height ** 2)]        │
│ Monotonicity: [none ▼]                      │
└─────────────────────────────────────────────┘
```

#### 8.2.5 Add Factor Dropdown

Below the factor list. A dropdown button labeled "+ Add Factor".

**Dropdown contents:**
- Search/filter input at top
- List of dataset columns NOT yet added as terms
- Each item shows: column name, dtype badge, n_unique count
- Categorical columns (Utf8/Categorical dtype) get a purple dot
- Numeric columns get a blue dot
- Clicking adds the column with a smart default type:
  - Utf8/Categorical → `categorical`
  - Numeric with n_unique ≤ 20 → `categorical` (likely coded variable)
  - Numeric with n_unique > 20 → `linear`
- After adding, the FactorCard appears expanded for immediate configuration

#### 8.2.6 Interaction List

Below the factor list, separated by a section header "Interactions".

**InteractionCard layout:**
```
┌─────────────────────────────────────────────┐
│ VehAge × Region                         [×] │
│   Type: product    Include main: ✓          │
└─────────────────────────────────────────────┘
```

#### 8.2.7 Add Interaction Dialog

A dialog/popover triggered by "+ Add Interaction" button.

**Dialog contents:**
1. **Variable 1:** Dropdown of current factors (from the factor list)
2. **Variable 1 type:** Defaults to the factor's current type. Can override (e.g., use linear for interaction even though main effect is bs).
3. **Variable 2:** Dropdown of current factors (excluding Variable 1)
4. **Variable 2 type:** Same as above
5. **Interaction type:**
   - Standard product (default)
   - Target encoding interaction
   - Frequency encoding interaction
6. **Include main effects:** Checkbox, default true
7. **TE options (if TE interaction):** Prior weight, n_permutations
8. **Add button**

#### 8.2.8 Fit Options Panel

Collapsible section labeled "Advanced Options" (collapsed by default).

**Contents:**
```
┌─────────────────────────────────────────────┐
│ ▼ Advanced Options                          │
├─────────────────────────────────────────────┤
│ Regularization: [None ▼]                    │
│                                             │
│   (When "ridge"/"lasso"/"elastic_net"):     │
│   CV Folds: [5]                             │
│   Selection: [min ▼] / [1se ▼]             │
│   Alpha path size: [20]                     │
│                                             │
│   (When "elastic_net"):                     │
│   L1 Ratio: [0.5] ────●──── slider 0→1     │
│                                             │
│   (When "Manual alpha"):                    │
│   Alpha: [0.01]                             │
│   L1 Ratio: [0.5]                           │
│                                             │
│ Max iterations: [25]                        │
│ Tolerance: [1e-8]                           │
│ Seed: [  ] (optional)                       │
└─────────────────────────────────────────────┘
```

#### 8.2.9 Fit Button

Large button at the bottom of the spec panel, always visible (sticky).

**States:**
- **Ready:** Blue button, "Fit Model". Disabled if spec is invalid (no response or no terms).
- **Fitting:** Button shows progress. Text: "Fitting... (iter 3/25, deviance: 135200)". Spinning indicator. If no iteration data: "Fitting..." with indeterminate spinner. Cancel button adjacent (Phase 2+).
- **Error:** Red alert below button with error_type heading, error_message body, and suggestion in muted text. Alert is dismissible.

### 8.3 Results Panel (Center)

#### 8.3.1 Tab Bar

Horizontal tabs at the top of the panel:
- **Summary** (default active tab)
- **Coefficients**
- **Relativities** (only shown for log-link models)
- **Diagnostics** (Phase 3)
- **Lift** (Phase 3)
- **Residuals** (Phase 3)

Each tab lazy-loads its data on first visit (via results-store). Shows a skeleton/spinner while loading.

#### 8.3.2 Summary Tab

**Layout:**

```
┌─────────────────────────────────────────────┐
│ Metric Cards (grid, 2-3 columns)            │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│ │ Deviance │ │   AIC    │ │   BIC    │     │
│ │ 132,811  │ │ 132,857  │ │ 133,113  │     │
│ └──────────┘ └──────────┘ └──────────┘     │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│ │ Iters: 6 │ │ Converged│ │ Obs: 678K│     │
│ │          │ │    ✓     │ │          │     │
│ └──────────┘ └──────────┘ └──────────┘     │
│ ┌──────────┐ ┌──────────┐                   │
│ │ df model │ │ df resid │                   │
│ │   22.0   │ │ 677,991  │                   │
│ └──────────┘ └──────────┘                   │
├─────────────────────────────────────────────┤
│ Model Summary (monospace pre block)          │
│                                             │
│   Generalized Linear Model Results          │
│   ==========================================│
│   Dep. Variable:    ClaimNb                 │
│   Model:            GLM                     │
│   Family:           Poisson                 │
│   Link:             Log                     │
│   ...                                       │
└─────────────────────────────────────────────┘
```

#### 8.3.3 Coefficients Tab

**Layout:**

```
┌─────────────────────────────────────────────┐
│ [Factor dropdown: All ▼] [Search: ____]     │
├─────────────────────────────────────────────┤
│ Feature      │ Estimate │ Std.Err │ z    │ p│
│──────────────┼──────────┼─────────┼──────┼──│
│ ▼ Intercept  │          │         │      │  │
│   Intercept  │  -2.876  │  0.031  │-92.2 │***│
│ ▼ VehAge     │          │         │      │  │
│   VehAge     │  -0.023  │  0.002  │-15.6 │***│
│ ▼ Region     │          │         │      │  │
│   [T.R11]    │   0.000  │    —    │  —   │  │
│   [T.R24]    │   0.146  │  0.029  │  5.1 │***│
│   [T.R31]    │  -0.234  │  0.035  │ -6.7 │***│
│   ...        │          │         │      │  │
│ ▼ DrivAge    │          │         │      │  │
│   bs(1/5)    │   0.512  │  0.045  │ 11.4 │***│
│   bs(2/5)    │   0.234  │  0.038  │  6.2 │***│
│   ...        │          │         │      │  │
└─────────────────────────────────────────────┘
```

**Features:**
- TanStack Table with shadcn/ui styling
- Grouped by `factor_name` with collapsible group headers
- Sortable by any column (click header)
- Filter by factor (dropdown) or search (text input)
- p-value cells color-coded: <0.001 = bold, <0.01 = normal, <0.05 = lighter, ≥0.05 = muted
- Significance column shows stars (***/**/*/./)
- Click any factor group header → navigates to FactorDrillDown view

#### 8.3.4 Relativities Tab

**Layout:**

```
┌─────────────────────────────────────────────┐
│ Factor: [Region ▼]                          │
├─────────────────────────────────────────────┤
│                                             │
│  [EMBLEM-STYLE RELATIVITY CHART]            │
│  (see Chart Specifications §12.1)           │
│                                             │
├─────────────────────────────────────────────┤
│ Level     │ Relativity │ CI       │ Exposure│
│───────────┼────────────┼──────────┼─────────│
│ R11 (base)│    1.000   │    —     │ 120,345 │
│ R24       │    1.157   │ 1.09-1.22│  85,210 │
│ R31       │    0.791   │ 0.74-0.85│  45,678 │
│ ...       │            │          │         │
└─────────────────────────────────────────────┘
```

**Behavior:**
- Factor dropdown shows all factors in the model
- Selecting a factor updates both the chart and the table
- For continuous/linear factors: shows a single row with the per-unit relativity
- For B-spline factors: shows the spline shape as a line chart (not bar chart)
- For target encoding: shows encoded value distribution

#### 8.3.5 Factor Drill-Down View

Reached by clicking a factor in the Coefficients tab. Shows detailed analysis for one factor.

**Layout:**
```
┌─────────────────────────────────────────────┐
│ ← Back to All Coefficients                  │
│                                             │
│ Factor: Region (categorical, 22 levels)     │
├─────────────────────────────────────────────┤
│ ┌───────────────────────────────────────┐   │
│ │ RELATIVITY CHART (if log-link)        │   │
│ └───────────────────────────────────────┘   │
│ ┌───────────────────────────────────────┐   │
│ │ COEFFICIENT TABLE                     │   │
│ │ Level │ Coef │ SE │ z │ p │ Rel │ Exp │   │
│ └───────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

#### 8.3.6 Fit Progress Bar

Shown at the top of the results panel when a fit is in progress.

```
┌─────────────────────────────────────────────┐
│ ⟳ Fitting model...  Iteration 3/25          │
│ ████████░░░░░░░░░░░░  12%                   │
│ Deviance: 135,200 (Δ -1,500)                │
└─────────────────────────────────────────────┘
```

If no iteration data (indeterminate):
```
┌─────────────────────────────────────────────┐
│ ⟳ Fitting model...                          │
│ ░░░░░░░░░░░░░░░░░░░░  (indeterminate)      │
└─────────────────────────────────────────────┘
```

#### 8.3.7 Fit Error Alert

Shown in the results panel when a fit fails.

```
┌─────────────────────────────────────────────┐
│ ⚠ ConvergenceError                     [×]  │
│                                             │
│ Model did not converge after 25 iterations. │
│ Final deviance change: 0.52                 │
│                                             │
│ 💡 Try increasing max_iter to 50+,          │
│    loosening tol (e.g., 1e-6), or           │
│    simplifying the model.                   │
└─────────────────────────────────────────────┘
```

Uses shadcn/ui `<Alert variant="destructive">`.

#### 8.3.8 Empty Results Placeholder

Shown when no model has been fit yet.

```
┌─────────────────────────────────────────────┐
│                                             │
│            📊                                │
│                                             │
│    Configure your model and click           │
│    "Fit Model" to see results here.         │
│                                             │
└─────────────────────────────────────────────┘
```

### 8.4 Code Panel (Right)

**Layout:**
```
┌─────────────────────────────────────────────┐
│ Generated Script              [📋 Copy]     │
├─────────────────────────────────────────────┤
│                                             │
│  Monaco Editor (read-only, Python)          │
│  theme: vs-dark                             │
│  language: python                           │
│  minimap: disabled                          │
│  wordWrap: on                               │
│  lineNumbers: on                            │
│  fontSize: 13                               │
│                                             │
└─────────────────────────────────────────────┘
```

**Behavior:**
- Updates live as the spec changes (debounced 500ms)
- When no spec configured: shows `# Configure a model to generate code`
- When spec is valid but not yet fit: shows the full script (data loading + model definition + fit + results)
- After fit completes: shows the stored generated code (identical, but from server)
- Copy button: copies full code to clipboard, shows "Copied!" toast

**Monaco configuration:**
```typescript
{
  readOnly: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontSize: 13,
  lineNumbers: "on",
  renderLineHighlight: "none",
  folding: true,
  wordWrap: "on",
  automaticLayout: true,  // Critical for resizable panels
  theme: "vs-dark",
  language: "python",
}
```

---

## 9. State Management

### 9.1 Store Architecture

Six Zustand stores, each with a single responsibility:

```
project-store   ← Project + dataset selection, dataset metadata
spec-store      ← Model specification (terms, family, interactions, fit options)
fit-store       ← Fit status, progress, WebSocket management
results-store   ← Cached model results (lazy-loaded per tab)
history-store   ← Model history list, comparison (Phase 2)
ui-store        ← Panel sizes, active tab, drill-down state
```

### 9.2 spec-store (most complex store)

```typescript
interface SpecState {
  // Model specification
  response: string | null;
  family: Family;
  link: Link | null;
  varPower: number;
  theta: number | null;
  offset: string | null;
  weights: string | null;
  intercept: boolean;
  terms: Record<string, TermSpec>;
  interactions: InteractionSpec[];
  fitOptions: FitOptions;

  // Actions
  setResponse: (col: string) => void;
  setFamily: (family: Family) => void;        // Also resets link to canonical
  setLink: (link: Link | null) => void;
  setVarPower: (p: number) => void;
  setTheta: (theta: number | null) => void;
  setOffset: (col: string | null) => void;
  setWeights: (col: string | null) => void;
  setIntercept: (val: boolean) => void;

  addTerm: (column: string, spec: TermSpec) => void;
  updateTerm: (column: string, updates: Partial<TermSpec>) => void;
  removeTerm: (column: string) => void;

  addInteraction: (interaction: InteractionSpec) => void;
  updateInteraction: (index: number, updates: Partial<InteractionSpec>) => void;
  removeInteraction: (index: number) => void;

  setFitOptions: (updates: Partial<FitOptions>) => void;

  // Derived (computed, not stored)
  toModelSpec: () => ModelSpec | null;         // null if invalid
  isValid: () => boolean;                      // Has response + at least 1 term
  validationErrors: () => string[];            // List of issues

  // Lifecycle
  reset: () => void;                           // Clear everything
  loadFromSpec: (spec: ModelSpec) => void;      // Populate from saved model
}
```

**Default FitOptions:**
```typescript
const DEFAULT_FIT_OPTIONS: FitOptions = {
  alpha: 0.0,
  l1_ratio: 0.0,
  max_iter: 25,
  tol: 1e-8,
  regularization: null,
  cv: null,
  selection: "min",
  n_alphas: 20,
  seed: null,
};
```

**Validation rules for `isValid()`:**
1. `response` is not null
2. `response` exists in dataset columns
3. At least one term is defined
4. All term columns exist in dataset
5. Offset column (if set) exists in dataset and is numeric
6. Weights column (if set) exists in dataset and is numeric
7. Response column is not also used as a term
8. For bs/ns terms: df or k is set (not both, not neither)
9. For expression terms: expr is not empty

### 9.3 fit-store

```typescript
interface FitState {
  isFitting: boolean;
  currentModelId: string | null;
  progress: FitProgress | null;
  error: { type: string; message: string; suggestion: string | null } | null;

  startFit: (projectId: string, datasetId: string, spec: ModelSpec) => Promise<void>;
  clearError: () => void;

  // Internal (called by WebSocket handler)
  _onProgress: (msg: FitProgress) => void;
  _onCompleted: (msg: { model_id: string; duration_ms: number; summary: object }) => void;
  _onFailed: (msg: { error_type: string; error_message: string; suggestion: string | null }) => void;
}
```

**`startFit` flow:**
1. Set `isFitting = true`, `error = null`
2. POST to `/api/models/{projectId}/fit`
3. Receive `{ model_id }`
4. Set `currentModelId = model_id`
5. Open WebSocket to `/ws/fit/{model_id}`
6. On `fit_progress`: update `progress`
7. On `fit_completed`: set `isFitting = false`, trigger results-store to load
8. On `fit_failed`: set `isFitting = false`, set `error`

### 9.4 results-store

```typescript
interface ResultsState {
  modelId: string | null;

  // Lazy-loaded data
  summary: string | null;
  summaryMetrics: {
    deviance: number; aic: number; bic: number; converged: boolean;
    iterations: number; n_obs: number; df_model: number; df_resid: number;
    null_deviance: number; fit_duration_ms: number;
  } | null;
  coefficients: CoefRow[] | null;
  relativities: RelativityRow[] | null;
  diagnostics: any | null;                    // Full diagnostics JSON
  generatedCode: string | null;

  // Loading flags
  loading: Record<string, boolean>;

  // Actions
  loadForModel: (modelId: string) => Promise<void>;   // Loads summary + code
  fetchCoefficients: () => Promise<void>;               // Lazy, on tab switch
  fetchRelativities: () => Promise<void>;               // Lazy, on tab switch
  fetchDiagnostics: () => Promise<void>;                // Lazy, on tab switch
  clear: () => void;
}
```

**Loading strategy:** When a model is selected (via fit completion or history click):
1. Immediately fetch summary + generated code (always needed)
2. Other data fetched on-demand when user switches to that tab
3. Once fetched, cached until a different model is selected

### 9.5 ui-store

```typescript
interface UIState {
  activeResultsTab: "summary" | "coefficients" | "relativities" |
                    "diagnostics" | "lift" | "residuals";
  drillDownFactor: string | null;             // Set when viewing per-factor details
  codePanelCollapsed: boolean;

  setActiveResultsTab: (tab: string) => void;
  setDrillDownFactor: (factor: string | null) => void;
  toggleCodePanel: () => void;
}
```

---

## 10. Code Generation Engine

### 10.1 Overview

The code generation service (`codegen_service.py`) transforms a ModelSpec JSON into a standalone, runnable Python script. The script should be copy-pasteable into a .py file or Jupyter notebook and produce identical results.

### 10.2 Output Structure

```python
import polars as pl
import rustystats as rs

# Load your data
data = pl.read_csv("your_data.csv")  # adjust path and format

# Model specification
terms = {
    "VehAge": {"type": "linear"},
    "DrivAge": {"type": "bs", "df": 5},
    "BonusMalus": {"type": "linear", "monotonicity": "increasing"},
    "Region": {"type": "categorical"},
    "VehBrand": {"type": "target_encoding", "prior_weight": 1.0},
    "Density": {"type": "ns", "df": 4},
}

interactions = [
    {
        "VehAge": {"type": "linear"},
        "Region": {"type": "categorical"},
        "include_main": True,
    },
]

# Build model
model = rs.glm_dict(
    response="ClaimNb",
    terms=terms,
    data=data,
    interactions=interactions,
    family="poisson",
    offset="Exposure",
    seed=42,
)

# Fit model
result = model.fit()

# View results
print(result.summary())

# Coefficient table
coef_table = result.coef_table()
print(coef_table)

# Relativities (for log-link models)
relativities = result.relativities()
print(relativities)

# Diagnostics
diagnostics = result.diagnostics(train_data=data)
print(diagnostics.to_json(indent=2))
```

### 10.3 Generation Rules

1. **Data loading:** Always `pl.read_csv("your_data.csv")` with comment "adjust path and format". Parquet alternative shown as comment.
2. **Terms dict:** One line per term. Only include non-default options (don't include `"degree": 3` for bs since that's the default).
3. **Interactions:** Only include if non-empty. Format as list of dicts.
4. **glm_dict call:** Only include non-default arguments. Don't include `link=None` (it's the default). Don't include `intercept=True` (default). Don't include `weights=None`.
5. **fit call:** Only include non-default arguments. Plain `model.fit()` if all defaults. Show regularization options when set.
6. **Results section:** Always show `summary()`. Show `coef_table()`. Show `relativities()` only for log-link families. Show `diagnostics()`.
7. **No UI-specific code:** The generated script is pure rustystats. No Atelier imports.

### 10.4 Client-Side Code Generation

For live preview in the code panel, the same logic is implemented in TypeScript (`frontend/src/lib/codegen.ts`). This avoids a round-trip to the server on every spec change. The server-side version is canonical (stored with the model), but the client-side version provides instant feedback.

The client-side generator must produce byte-for-byte identical output to the server-side generator for the same input.

---

## 11. Error Handling & Recovery

### 11.1 rustystats Error Mapping

| Exception | HTTP Status | Inline Message | Suggestion |
|-----------|-------------|---------------|------------|
| `ConvergenceError` | 500 | "{original message}" | "Try increasing max_iter to 50+, loosening tol (e.g., 1e-6), or simplifying the model (remove terms with many levels or high-df splines)." |
| `DesignMatrixError` | 422 | "{original message}" | "Check that all factor columns exist in the dataset, categorical levels are consistent, and there are no all-missing columns. Remove factors with zero variance." |
| `FittingError` | 500 | "{original message}" | "The model could not be fit. Check for perfect separation (binomial), zero exposure values, or collinear terms. Try removing recently added terms." |
| `EncodingError` | 422 | "{original message}" | "Target/frequency encoding failed. Ensure the response column has no missing values and the encoding factor has sufficient observations per level." |
| `ValidationError` | 422 | "{original message}" | "Invalid model specification. Check that family/link combination is valid, column names match the dataset, and spline df > 0." |
| `PredictionError` | 500 | "{original message}" | "Prediction failed. Ensure new data has the same columns and factor levels as training data." |
| `SerializationError` | 500 | "{original message}" | "Model serialization failed. This is an internal error — try re-fitting the model." |
| Other exceptions | 500 | "{original message}" | "An unexpected error occurred. Check the server logs for details." |

### 11.2 Frontend Error Display

- **Fit errors:** Shown in the FitButton area as a red `<Alert>` component with the error type as heading, message as body, and suggestion in muted italic text.
- **API errors (non-fit):** Shown as toast notifications (top-right) with error type and message.
- **Network errors:** "Connection lost. Retrying..." banner at top of page.
- **Upload errors:** Shown inline in the DataUpload component.

### 11.3 Data Validation Warnings

The spec builder shows inline warnings (yellow badges) next to factors with potential issues:

| Issue | Detection | Warning Text |
|-------|-----------|-------------|
| Zero variance column | `n_unique == 1` in column metadata | "This column has no variation" |
| All missing values | `n_missing == n_rows` | "This column is entirely missing" |
| High cardinality + categorical | `n_unique > 100 && type == "categorical"` | "100+ levels — consider target encoding" |
| Very few observations per level | Not detectable from metadata alone | (Only after fit failure) |
| Column used as both term and offset | Spec validation | "Cannot use same column as term and offset" |
| Response used as term | Spec validation | "Response column cannot be a predictor" |

---

## 12. Chart Specifications

### 12.1 Emblem-Style Relativity Chart (`RelativityChart.tsx`)

This is the signature chart. It shows relativities per factor level with exposure overlay and confidence bands.

**Chart type:** Plotly bar chart with dual Y-axes

**Traces:**

1. **Bar trace (primary Y-axis):**
   - X: factor levels (categorical axis)
   - Y: relativity values
   - Color: `var(--chart-neutral)` (blue)
   - Error bars: CI lower and upper (from `conf_int()`)
   - Hover template: "Level: {x}\nRelativity: {y:.4f}\nCI: [{ci_lower:.4f}, {ci_upper:.4f}]"

2. **Line/area trace (secondary Y-axis):**
   - X: same factor levels
   - Y: exposure (total exposure per level)
   - Color: `var(--chart-exposure)` (amber)
   - Fill: `tozeroy` with 20% opacity
   - Line width: 2px
   - Hover template: "Exposure: {y:,.0f}"

3. **Reference line:**
   - Horizontal line at relativity = 1.0
   - Color: `var(--chart-reference)` (gray)
   - Dash: "dash"
   - Width: 1px

**Layout:**
```typescript
{
  paper_bgcolor: "transparent",
  plot_bgcolor: "transparent",
  font: { family: "system-ui", color: "var(--foreground)", size: 11 },
  margin: { t: 30, r: 60, b: 80, l: 60 },

  xaxis: {
    title: null,
    tickangle: -45,                    // Angled labels for long level names
    gridcolor: "var(--chart-grid)",
    showgrid: false,
  },
  yaxis: {
    title: "Relativity",
    gridcolor: "var(--chart-grid)",
    zeroline: false,
    side: "left",
  },
  yaxis2: {
    title: "Exposure",
    overlaying: "y",
    side: "right",
    showgrid: false,
    gridcolor: "var(--chart-grid)",
  },

  legend: {
    orientation: "h",
    y: -0.2,
    x: 0.5,
    xanchor: "center",
  },

  showlegend: true,
  hovermode: "x unified",
}
```

**Exposure data source:** For Phase 1, we compute exposure per level from the dataset directly:
```python
# In results_service.py, when the factor is categorical:
exposure_by_level = data.group_by(factor_col).agg(
    pl.col(offset_col).sum().alias("exposure") if offset_col else pl.count().alias("exposure")
).sort(factor_col)
```

This is returned alongside relativities so the chart has both series.

**For continuous/linear factors:** Instead of a bar chart, show a line chart of the relativity function. X = range of values (quantiles), Y = relativity at that value.

**For spline factors:** Show the spline shape curve. X = evenly spaced grid across the variable's range, Y = exp(f(x)) where f(x) is the spline prediction. Include confidence band.

### 12.2 Shared Chart Theme (`chart-theme.ts`)

```typescript
export const PLOTLY_DARK_THEME = {
  paper_bgcolor: "transparent",
  plot_bgcolor: "transparent",
  font: {
    family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: "hsl(0 0% 63.9%)",
    size: 11,
  },
  xaxis: {
    gridcolor: "hsl(0 0% 14.9%)",
    zerolinecolor: "hsl(0 0% 14.9%)",
  },
  yaxis: {
    gridcolor: "hsl(0 0% 14.9%)",
    zerolinecolor: "hsl(0 0% 14.9%)",
  },
  colorway: [
    "hsl(210 100% 52%)",    // Primary blue
    "hsl(45 93% 47%)",      // Amber
    "hsl(142 76% 36%)",     // Green
    "hsl(0 62.8% 50.6%)",   // Red
    "hsl(280 65% 60%)",     // Purple
    "hsl(180 65% 45%)",     // Teal
  ],
};
```

### 12.3 Lift Chart (Phase 3)

**Chart type:** Plotly bar + line combo

**Traces:**
1. Bars: Actual/Expected ratio per decile (10 bars)
2. Line: Cumulative lift
3. Reference line at A/E = 1.0

**X-axis:** Deciles 1-10
**Y-axis (primary):** A/E ratio
**Y-axis (secondary):** Cumulative lift

### 12.4 Residual Plots (Phase 3)

**Four plot types:**
1. **Deviance residuals vs fitted:** Scatter plot. X = fitted values, Y = deviance residuals. LOESS smoothing overlay.
2. **Pearson residuals vs fitted:** Same layout.
3. **QQ plot:** Theoretical vs observed quantiles. X = theoretical normal quantiles, Y = sample quantiles. 45-degree reference line.
4. **Residuals by factor:** Box plots. X = factor levels, Y = residuals.

### 12.5 Calibration Plot (Phase 3)

**Chart type:** Scatter with 45-degree reference

**Traces:**
1. Scatter: X = predicted, Y = observed (binned means)
2. Error bars: confidence intervals per bin
3. 45-degree reference line (perfect calibration)

---

## 13. Edge Cases & Behavior Matrix

### 13.1 Dataset Edge Cases

| Scenario | Detection Point | Behavior |
|----------|----------------|----------|
| File > 500MB | Upload endpoint | Reject with 413 |
| Non-CSV/Parquet | Upload endpoint | Reject with 400 |
| CSV parse error | polars.read_csv | Return 422 with parse error details |
| Empty file (0 rows) | After polars read | Return 422 "Dataset is empty" |
| Duplicate column names | After polars read | Return 422 with duplicated names listed |
| Single row | After polars read | Warning in metadata (fitting may fail) |
| All-null column | Column metadata | Warning badge on column in factor list |
| Column with spaces | polars handles this | Works fine (polars supports arbitrary column names) |
| Very wide file (1000+ columns) | After polars read | Works but AddFactorDropdown needs search/filter |

### 13.2 Spec Edge Cases

| Scenario | Detection Point | Behavior |
|----------|----------------|----------|
| No response selected | Spec validation | FitButton disabled, tooltip: "Select a response variable" |
| No terms added | Spec validation | FitButton disabled, tooltip: "Add at least one factor" |
| Same column as response and term | Spec validation | Warning on the term: "This column is the response variable" |
| Same column as offset and term | Spec validation | Warning: "Using same column as offset and term" |
| bs with df=0 | Spec validation | Error: "Degrees of freedom must be ≥ 1" |
| bs with both df and k | Spec validation | Error: "Set either df or k, not both" |
| Expression with invalid syntax | Caught at fit time | FittingError with suggestion |
| Interaction between non-existent factors | Should not happen (UI prevents) | Backend validates; 422 |
| 100+ terms | No hard limit | Performance warning |

### 13.3 Fit Edge Cases

| Scenario | Exception | Recovery |
|----------|-----------|----------|
| Perfect separation (binomial) | FittingError | Suggest regularization |
| All zero response | FittingError | "Response column has no variation" |
| Zero exposure in offset | FittingError | "Zero values in offset column (log of zero is undefined)" |
| Singular design matrix | DesignMatrixError | Lists problematic columns |
| Collinear terms | DesignMatrixError | "High correlation between X and Y — remove one" |
| NaN/Inf in data | DesignMatrixError | "NaN or Inf values detected in columns: X, Y" |
| Convergence failure | ConvergenceError | Suggest max_iter increase, tol relaxation |
| Memory error (very large) | MemoryError | "Dataset too large for available memory. Consider sampling." |

### 13.4 State Transition Edge Cases

| Scenario | Behavior |
|----------|----------|
| User changes spec while fit is running | Spec changes freely. Running fit uses the spec snapshot from when it was triggered. New fit can be triggered (creates another model in history). |
| User uploads new dataset while fit is running | Fit continues on old dataset. New dataset becomes active. Spec may show warnings if columns differ. |
| User navigates away during fit | Fit continues in background. On return, if fit completed, results are available via history. |
| WebSocket disconnects during fit | Fit continues. Frontend shows "Connection lost, retrying..." Reconnects to get latest status. |
| Two fits triggered rapidly | Both create model records. Both run (sequentially due to GIL, but in separate asyncio tasks). Both appear in history. |
| Fit completes but results extraction fails | Model saved with status="failed", error_type="ResultExtractionError". Rare edge case. |

---

## 14. Configuration & Packaging

### 14.1 pyproject.toml

```toml
[project]
name = "atelier"
version = "0.1.0"
description = "Browser-based GLM workbench for actuarial pricing"
readme = "README.md"
license = { text = "MIT" }
requires-python = ">=3.13"
dependencies = [
    "rustystats>=0.3.9",
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.34.0",
    "python-multipart>=0.0.18",
    "sqlalchemy>=2.0.36",
    "aiosqlite>=0.20.0",
    "pydantic>=2.10.0",
    "polars>=1.0.0",
    "click>=8.1.0",
    "websockets>=14.0",
]

[project.scripts]
atelier = "atelier.cli:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/atelier"]

[tool.hatch.build.targets.wheel.force-include]
"src/atelier/static" = "atelier/static"

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.24.0",
    "httpx>=0.27.0",
]
```

### 14.2 Frontend package.json (key dependencies)

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^5.0.0",
    "react-plotly.js": "^2.6.0",
    "plotly.js-cartesian-dist": "^2.35.0",
    "@tanstack/react-table": "^8.21.0",
    "@monaco-editor/react": "^4.7.0",
    "react-resizable-panels": "^4.6.0",
    "next-themes": "^0.4.0",
    "react-use-websocket": "^4.9.0",
    "tailwindcss": "^4.0.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.6.0",
    "lucide-react": "^0.469.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
```

### 14.3 Vite Configuration

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8457",
      "/ws": {
        target: "ws://localhost:8457",
        ws: true,
      },
    },
  },
  build: {
    outDir: "../src/atelier/static",
    emptyOutDir: true,
  },
});
```

### 14.4 Development Workflow

**Two-process development:**
1. Terminal 1: `cd /home/ralph/atelier && uv run atelier --no-browser --port 8457`
2. Terminal 2: `cd /home/ralph/atelier/frontend && npm run dev`
3. Open: `http://localhost:5173` (Vite dev server with HMR, proxies API to :8457)

**Production build:**
1. `cd frontend && npm run build` (outputs to `src/atelier/static/`)
2. `cd .. && uv run atelier` (serves everything from FastAPI)

**Full package build:**
1. `cd frontend && npm run build`
2. `cd .. && uv build` (creates wheel with static assets included)

---

## 15. rustystats API Reference (Quick Lookup)

### 15.1 Entry Point

```python
rs.glm_dict(
    response: str,                          # Column name
    terms: Dict[str, Dict],                 # Column → spec
    data: pl.DataFrame,                     # Training data
    interactions: Optional[List[Dict]],     # Interaction specs
    intercept: bool = True,
    family: str = "gaussian",               # gaussian|poisson|binomial|gamma|tweedie|quasipoisson|quasibinomial|negbinomial
    link: Optional[str] = None,             # identity|log|logit|inverse (None=canonical)
    var_power: float = 1.5,                 # Tweedie only
    theta: Optional[float] = None,          # NegBin only (None=estimate)
    offset: Optional[Union[str, np.ndarray]] = None,
    weights: Optional[Union[str, np.ndarray]] = None,
    seed: Optional[int] = None,
) -> FormulaGLMDict
```

### 15.2 Fit

```python
FormulaGLMDict.fit(
    alpha: float = 0.0,
    l1_ratio: float = 0.0,
    max_iter: int = 25,
    tol: float = 1e-8,
    cv: Optional[int] = None,
    selection: str = "min",                 # "min" or "1se"
    regularization: Optional[str] = None,   # "ridge"|"lasso"|"elastic_net"
    n_alphas: int = 20,
    alpha_min_ratio: float = 0.0001,
    cv_seed: Optional[int] = None,
    include_unregularized: bool = True,
    verbose: bool = False,
    store_design_matrix: bool = True,
) -> GLMModel
```

### 15.3 GLMModel Properties

```python
.params: np.ndarray          .feature_names: List[str]
.family: str                 .link: str
.formula: str                .nobs: int
.deviance: float             .converged: bool
.iterations: int
```

### 15.4 GLMModel Methods

```python
.summary() -> str
.coef_table() -> pl.DataFrame
.relativities() -> pl.DataFrame
.predict(new_data, offset=None) -> np.ndarray
.compute_loss(data, response=None, exposure=None) -> float
.diagnostics(train_data, ...) -> ModelDiagnostics
.diagnostics_json(train_data, ...) -> str
.to_bytes() -> bytes
GLMModel.from_bytes(data: bytes) -> GLMModel
.bse() -> np.ndarray
.tvalues() -> np.ndarray
.pvalues() -> np.ndarray
.conf_int(alpha=0.05) -> np.ndarray  # shape (n_params, 2)
.significance_codes() -> List[str]
.selected_features() -> List[str]    # For Lasso/EN
```

### 15.5 Term Types

| Type | Required Options | Optional Options |
|------|-----------------|-----------------|
| `categorical` | — | `levels: List[str]` |
| `linear` | — | `monotonicity: "increasing"\|"decreasing"` |
| `bs` | `df: int` OR `k: int` | `degree: int (1-3)`, `monotonicity` |
| `ns` | `df: int` OR `k: int` | — |
| `target_encoding` | — | `prior_weight: float`, `n_permutations: int` |
| `frequency_encoding` | — | — |
| `expression` | `expr: str` | `monotonicity` |

### 15.6 Interaction Format

```python
# Standard product
{"VehAge": {"type": "linear"}, "Region": {"type": "categorical"}, "include_main": True}

# Target encoding interaction
{"Brand": {"type": "categorical"}, "Region": {"type": "categorical"}, "target_encoding": True, "include_main": False}

# Frequency encoding interaction
{"Brand": {"type": "categorical"}, "Region": {"type": "categorical"}, "frequency_encoding": True}
```

### 15.7 Canonical Links

| Family | Canonical Link |
|--------|---------------|
| gaussian | identity |
| poisson | log |
| binomial | logit |
| gamma | log |
| tweedie | log |
| quasipoisson | log |
| quasibinomial | logit |
| negbinomial | log |

### 15.8 Exception Hierarchy

```
RustyStatsError
├── DesignMatrixError
├── FittingError
│   └── ConvergenceError
├── PredictionError
├── EncodingError
├── ValidationError
└── SerializationError
```
