# Commit Standards

Every commit merged into `main` must satisfy the checks below. Review this list during code review and before approving a PR.

---

## Design Philosophy

These are the non-negotiable principles that shape every decision in Atelier. If a commit conflicts with any of these, it needs rethinking.

### rustystats is the modelling engine

All GLM fitting, diagnostics, and statistical computation is delegated to [rustystats](https://github.com/PricingFrontier/rustystats). Atelier never reimplements GLM algorithms, residual calculations, or score tests. If rustystats doesn't support something, contribute it upstream — don't work around it in Python.

### Thin API layer

FastAPI endpoints are glue. They validate input (Pydantic), call a service function, and return the result. No business logic in route handlers. Services orchestrate calls to rustystats, polars, and the database.

### Data stays server-side

Parquet files and polars DataFrames live on the backend. The browser receives only summaries, aggregated charts, and fit results — never raw row-level data. This keeps the frontend fast regardless of dataset size.

### The UI never crashes

Bad data, failed fits, or backend errors show an error banner — not a white screen. The last known good state is always preserved. Every `fetch` call in the frontend must handle failure gracefully.

### Local-first, single-user

Atelier runs on `localhost` for one user at a time. There is no auth, no multi-tenancy, no cloud deployment target. Design for simplicity: SQLite for metadata, filesystem for data files, `~/.atelier/` for state.

### Polars, not pandas

All tabular data manipulation uses polars. Never convert to pandas. Watch for plausible-but-wrong pandas-style method names (e.g. `df.groupby()` instead of `df.group_by()`).

---

## Engineering Standards

## 1. No Duplication (DRY)

- No copy-pasted logic. If two places do the same thing, extract a shared function/module.
- Shared utilities live in well-known locations (`services/`, `frontend/src/lib/`).
- Frontend and backend representations of the same concept (e.g. model spec shapes) must stay in sync.

## 2. Simplicity (KISS)

- Prefer the simplest solution that works. No premature abstractions.
- If a function takes more than 5 parameters, consider a config object or breaking it up.
- Avoid clever one-liners that sacrifice readability.

## 3. Single Responsibility

- Each module, class, and function does one thing.
- API endpoints are thin — validation and response shaping only. Business logic lives in the service layer (`services/`).
- React components: rendering only. Side effects in hooks, data fetching in API helpers.

## 4. Type Safety

- **Python**: All function signatures have type annotations. No `Any` unless truly unavoidable.
- **Python API**: Every endpoint uses Pydantic request/response models. No `body: dict`.
- **TypeScript**: No `any`. Use proper interfaces/types for all props, state, and API responses. Shared types live in `frontend/src/types/`.

## 5. Linter Clean

- `ruff check src/atelier/` must pass with zero errors before merge.
- Frontend must have no TypeScript errors (`tsc --noEmit`).
- New ruff rules are not silenced without a comment explaining why.

## 6. No Dead Code

- No unused imports, variables, or functions.
- No commented-out code blocks. Use version control to retrieve old code.
- No empty files. If a file has no content, delete it.

## 7. No Stale Documentation

- If you change behaviour, update the relevant doc in `docs/`.
- README examples must actually run.

## 8. Dependency Discipline

- No heavy optional dependencies in core `[project.dependencies]`. Use `[project.optional-dependencies]`.
- Pin minimum versions, not exact versions.
- Every new dependency must be justified in the PR description.

## 9. No Resource Leaks

- File handles: use `with` statements. Never `open()` without close.
- Async tasks: always cancellable. Use lifespan context managers, not `on_event`.
- Database sessions: use async context managers. Never leave a session open across an `await` boundary that could raise.

## 10. Correct Data Structures

- Use `deque` for FIFO, not `list.pop(0)`.
- Use `set` for membership checks, not list scans.
- Use polars over hand-rolled loops for any tabular operation.

## 11. Error Handling

- Never swallow exceptions silently (`except: pass`).
- API errors return structured JSON with status codes, not bare strings.
- The frontend never crashes due to bad data. Worst case: show last good state + error banner.

## 12. Consistent Naming

- Python: `snake_case` for functions/variables, `PascalCase` for classes.
- TypeScript: `camelCase` for functions/variables, `PascalCase` for components/types.
- API response fields use `snake_case` (Python convention). Frontend transforms to `camelCase` only if needed at the component level.

## 13. Idiomatic React

- No module-level mutable state. Use `useRef` for instance-scoped values.
- Side effects only in `useEffect` or event handlers.
- Memoize expensive computations with `useMemo`/`useCallback`.
- Prefer controlled components.
- Global state in Zustand stores, not prop-drilled context or lifted state.

## 14. Async Discipline

- All FastAPI route handlers are `async def`.
- Database calls go through `aiosqlite` via SQLAlchemy async sessions — never use synchronous `sqlite3` directly.
- CPU-bound work (rustystats fitting) should use `asyncio.to_thread()` or `run_in_executor()` to avoid blocking the event loop.

## 15. Security Basics

- No hardcoded secrets or API keys. Use environment variables.
- File access endpoints must validate paths stay within the project root.
- No `eval()` or `exec()` on user input.

## 16. Test Coverage

- New business logic must include at least one test.
- Bug fixes must include a regression test.
- Tests must not depend on external services or network access.
- Never delete or weaken an existing test without explicit justification in the PR.

## 17. Commit Hygiene

- Each commit is atomic: one logical change per commit.
- Commit messages follow conventional format: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`.
- No generated files (`node_modules/`, `__pycache__/`, build output) in commits.

---

## LLM-Generated Code: Watch For These

AI coding assistants produce plausible-looking code that often hides real problems. Every reviewer (human or AI) must check for these patterns specifically.

### Dangerous fallbacks that mask errors

```python
# BAD — silently returns empty data instead of crashing
def get_data(path):
    try:
        return pl.read_parquet(path)
    except Exception:
        return pl.DataFrame()  # caller has no idea it failed
```

- Never return a default value from a `catch` unless the caller explicitly expects it.
- Prefer letting exceptions propagate. If you must catch, log the error and re-raise or return a result type that signals failure.
- Watch for `or {}`, `or []`, `or ""` fallbacks that turn a bug into silent wrong data.

### Broad exception swallowing

- `except Exception: pass` is almost never correct. Catch the specific exception you expect.
- `except Exception as e: return {"error": str(e)}` in API endpoints is fine — but only at the outermost layer. Inner code should not catch broadly.

### Hallucinated APIs and parameters

- LLMs invent function signatures, config keys, and library methods that don't exist. Every API call, import, and parameter must be verified against the actual codebase or library docs.
- Watch for plausible-but-wrong polars methods (e.g. `df.groupby()` instead of `df.group_by()`).
- Watch for invented rustystats parameters or return fields. Check the actual rustystats API.

### Stale patterns from older library versions

- LLMs train on old code. Watch for deprecated patterns:
  - `@app.on_event("startup")` → use `lifespan` context manager
  - `from typing import List, Dict` → use `list`, `dict` (Python 3.13+)
  - `pd.DataFrame` when we use `pl.DataFrame`
  - SQLAlchemy 1.x patterns when we use 2.0-style async

### Defensive code that hides bugs

```python
# BAD — if config is missing a key, this silently returns empty
result = config.get("model", {}).get("terms", {}).get("factors", [])
```

- Chained `.get()` with default dicts makes `KeyError` impossible to diagnose. If the key should exist, access it directly and let it fail loudly.
- Only use `.get()` with defaults when the key is genuinely optional.

### Duplicated logic disguised as "safety"

- LLMs often generate a "just in case" check that duplicates logic already handled upstream. This creates two code paths that must be kept in sync.
- If a function already validates its input, don't re-validate it in the caller.

### Over-abstraction and premature generalisation

- LLMs love creating `BaseModel`, `ModelFactory`, `AbstractFitter` hierarchies for code that has exactly one concrete implementation.
- If there's only one subclass, you don't need the base class.
- Prefer plain functions over class hierarchies until you have three concrete use cases.

### Comments that restate the code

```python
# BAD — the comment adds zero information
x = x + 1  # increment x by 1
```

- LLMs pad output with obvious comments. Comments should explain *why*, not *what*.
- Delete any comment that a competent reader could infer from the code itself.

### Untested edge cases presented as handled

- LLMs generate `if` branches for edge cases but don't test them. An untested branch is worse than no branch — it gives false confidence.
- If you add an edge case handler, add a test for it. If you can't test it, add a `# TODO: untested` comment.

### Import bloat

- LLMs import modules speculatively. If a function isn't used, the import shouldn't be there.
- Watch for `from typing import ...` lines that grow with every edit but never shrink.

---

## Backward Compatibility: None Required

This is a brand new application with no users yet. Do not add compatibility shims, version checks, or migration code.

- **No "legacy" support** — if an API is poorly designed, change it. Do not keep the old version alongside the new one.
- **No feature flags** — if a feature is ready, ship it. Do not add `ENABLE_NEW_X` environment variables.
- **No versioned endpoints** — `/api/v1/` is unnecessary. Use `/api/` and evolve it as needed.
- **No migration scripts** — if the data model changes, delete the SQLite DB and update the code. There is no production data to migrate.
- **No deprecation warnings** — if something is wrong, remove it. Do not add `warnings.warn` with a future removal date.

The only exception is the public PyPI package interface (`atel` / `atelier` CLI). Prioritize clean, simple code over compatibility gymnastics.

---

## Quick Checklist

Copy into PR descriptions:

```
Design Philosophy
- [ ] Statistical computation delegated to rustystats — no reimplemented GLM logic
- [ ] API endpoints are thin glue — business logic in services
- [ ] No raw row-level data sent to the browser — only summaries and aggregates
- [ ] UI handles errors gracefully (error banner, not crash)
- [ ] Uses polars for all tabular work — no pandas

Engineering Standards
- [ ] No duplicated logic
- [ ] All functions have type annotations
- [ ] API endpoints use Pydantic request/response models
- [ ] `ruff check src/atelier/` passes with zero errors
- [ ] No unused imports, variables, or dead code
- [ ] Docs updated if behaviour changed
- [ ] No new heavy dependencies in core
- [ ] No resource leaks (file handles, DB sessions, async tasks)
- [ ] Error cases return structured JSON responses, not bare strings
- [ ] Consistent naming (snake_case Python, camelCase TypeScript, PascalCase classes/components)
- [ ] React state in Zustand stores or hooks — not module-level variables
- [ ] Async endpoints use async DB sessions; CPU-bound work off the event loop
- [ ] Tests added for new logic; bug fixes include regression tests

LLM Code Review
- [ ] No silent fallbacks that mask errors (return empty data, `or {}`, `or []`)
- [ ] No broad exception swallowing (`except Exception: pass`)
- [ ] All API calls and imports verified against actual codebase/library docs
- [ ] No deprecated patterns (old typing imports, on_event, pandas, SQLAlchemy 1.x)
- [ ] No chained .get() on keys that should exist — fail loudly on missing data
- [ ] No redundant validation that duplicates upstream checks
- [ ] No premature abstraction (base classes with one subclass)
- [ ] Comments explain why, not what — no restating the code
- [ ] Edge case branches have tests, or are marked # TODO: untested

Backward Compatibility
- [ ] No compatibility shims, version flags, or migration code
- [ ] Bad APIs are replaced, not versioned alongside
```
