#!/usr/bin/env python3
"""Private stream reader for a Sanity raw dataset export.
Output contains full private document bodies. It must be consumed only by the accompanying
DBK-46 JS process and must NEVER be pasted into chat or committed.
"""
from __future__ import annotations
import json
import sys
import tarfile
from pathlib import Path

ALLOW = {"auditEvent", "staffSession"}

def main() -> int:
    if len(sys.argv) != 2:
        print('STOP: expected one private Sanity tar.gz export path', file=sys.stderr)
        return 2
    backup = Path(sys.argv[1])
    if not backup.is_file():
        print('STOP: export not found', file=sys.stderr)
        return 2
    with tarfile.open(backup, 'r:gz') as tar:
        ndjson = [m for m in tar.getmembers() if m.isfile() and Path(m.name).name == 'data.ndjson']
        if len(ndjson) != 1:
            print('STOP: expected exactly one data.ndjson in export', file=sys.stderr)
            return 2
        stream = tar.extractfile(ndjson[0])
        if stream is None:
            print('STOP: cannot read document stream', file=sys.stderr)
            return 2
        for raw in stream:
            if len(raw) > 2_000_000:
                print('STOP: document unusually large', file=sys.stderr)
                return 2
            if not raw.strip():
                continue
            try:
                doc = json.loads(raw)
            except (ValueError, UnicodeError):
                print('STOP: malformed backup JSON', file=sys.stderr)
                return 2
            if not isinstance(doc, dict) or not isinstance(doc.get('_type'), str):
                print('STOP: invalid document in archive', file=sys.stderr)
                return 2
            if doc['_type'] not in ALLOW:
                continue
            if not isinstance(doc.get('_id'), str) or not doc['_id']:
                print('STOP: missing source document ID', file=sys.stderr)
                return 2
            print(json.dumps(doc, ensure_ascii=False, separators=(',', ':')))
    return 0

if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (OSError, tarfile.TarError, UnicodeError):
        print('STOP: unable to read verified archive', file=sys.stderr)
        raise SystemExit(2)
