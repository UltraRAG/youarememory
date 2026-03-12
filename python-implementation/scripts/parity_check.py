#!/usr/bin/env python3
from __future__ import annotations

import runpy
from pathlib import Path


def main() -> None:
    legacy_script = Path(__file__).resolve().parents[2] / "apps" / "memory-lab-py" / "scripts" / "parity_check.py"
    runpy.run_path(str(legacy_script), run_name="__main__")


if __name__ == "__main__":
    main()
