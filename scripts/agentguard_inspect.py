"""Optional local adapter to AgentGuard's real repository index.

No hooks, daemon, global configuration or copied AgentGuard code. The source path
comes from --source or AGENTGUARD_SOURCE; the default is the user's sibling checkout.
Use a Python environment with AgentGuard's dependencies (Python >= 3.12).
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path(os.environ.get("AGENTGUARD_SOURCE", Path(__file__).resolve().parents[2] / "AgentGuard")))
    args = parser.parse_args()
    source = args.source.expanduser().resolve() / "src"
    if not (source / "agentguard").is_dir():
        print("AgentGuard source unavailable. Set AGENTGUARD_SOURCE to its checkout. No integration was run.", file=sys.stderr)
        return 2
    sys.path.insert(0, str(source))
    try:
        from agentguard.repo.index import RepoIndex
        index = RepoIndex(Path(__file__).resolve().parents[1]).build()
        summary = index.summary()
        print(json.dumps({"integration": "AgentGuard repository index", "source": str(args.source.resolve()), "summary": summary, "limitations": ["Read-only development inspection, not a live coding-agent hook", "Unknown language extraction remains unknown", "Runtime migration policies are Relay's original TypeScript guards"]}, indent=2, default=str))
        return 0
    except (ImportError, OSError) as error:
        print(f"AgentGuard could not run: {error}. Use a native Python >=3.12 environment with its dependencies.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
