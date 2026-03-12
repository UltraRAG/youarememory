from __future__ import annotations

import runpy
from pathlib import Path


def main() -> None:
    legacy_entry = Path(__file__).resolve().parents[1] / "apps" / "memory-lab-py" / "streamlit_app.py"
    runpy.run_path(str(legacy_entry), run_name="__main__")


if __name__ == "__main__":
    main()
