#!/usr/bin/env python3
"""Convert a document to Markdown through MarkItDown."""

import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) < 2:
        print("missing file path", file=sys.stderr)
        return 1

    file_path = Path(sys.argv[1])
    if not file_path.exists() or not file_path.is_file():
        print("file not found", file=sys.stderr)
        return 1

    try:
        from markitdown import MarkItDown
    except Exception as exc:
        print(f"markitdown import failed: {exc}", file=sys.stderr)
        return 2

    try:
        result = MarkItDown().convert(str(file_path))
        text = getattr(result, "text_content", None)
        if text is None:
            text = getattr(result, "markdown", None)
        if text is None:
            text = str(result)
        sys.stdout.write((text or "").strip())
        return 0
    except Exception as exc:
        print(f"markitdown convert failed: {exc}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
