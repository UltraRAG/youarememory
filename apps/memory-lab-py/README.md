# memory-lab-py

Python-first local lab for YouAreMemory:

- Directly reads/writes the same SQLite schema as TS plugin.
- Loads the same skills rules from `packages/openclaw-memory-plugin/skills`.
- Provides Streamlit UI for quick manual verification.
- Includes parity script to compare Python and TS retrieval outputs.

## Install

```bash
cd apps/memory-lab-py
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run UI

```bash
cd apps/memory-lab-py
source .venv/bin/activate
streamlit run streamlit_app.py
```

## Run parity check

Before parity check, build plugin once:

```bash
npm run build --workspace @youarememory/openclaw-memory-plugin
```

Then:

```bash
python3 apps/memory-lab-py/scripts/parity_check.py \
  --query "我这个项目最近进展到哪里了？" \
  --db ~/.openclaw/youarememory/memory.sqlite
```
