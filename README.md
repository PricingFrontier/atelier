# Atelier

Browser-based GLM workbench that wraps [rustystats](https://github.com/PricingFrontier/rustystats) in a GUI.

## Installation

```bash
pip install atelier
# or
uv add atelier
```

## Usage

```bash
atelier               # starts server, opens browser
atelier --port 9000   # custom port
atelier --no-browser  # server only
```

## Development

```bash
# Backend
uv run atelier --no-browser --port 8457

# Frontend (separate terminal)
cd frontend && npm run dev
```

Open `http://localhost:5173` for the Vite dev server with HMR.
