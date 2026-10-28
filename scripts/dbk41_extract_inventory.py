#!/usr/bin/env python3
"""Private pipe-only NDJSON extractor. Do not run standalone: outputs document bodies.

Invoked by dbk41_stage_inventory.mjs, which consumes this data without printing it.
"""
from __future__ import annotations
import json
import sys
import tarfile
from pathlib import Path


def main():
    if len(sys.argv) != 2:
        print('Need export archive path', file=sys.stderr)
        return 2
    archive_path = Path(sys.argv[1])
    if not archive_path.is_file():
        print('Archive does not exist', file=sys.stderr)
        return 2
    count = 0
    with tarfile.open(archive_path, 'r:gz') as archive:
        members = [m for m in archive.getmembers() if m.isfile() and m.name.endswith('.ndjson')]
        members = [m for m in members if Path(m.name).name == 'data.ndjson'] or members
        if len(members) != 1:
            print('STOP: expected one NDJSON document stream', file=sys.stderr)
            return 2
        with archive.extractfile(members[0]) as stream:
            if stream is None:
                print('STOP: data stream not readable', file=sys.stderr)
                return 2
            for raw in stream:
                if not raw.strip():
                    continue
                try:
                    doc = json.loads(raw)
                except (ValueError, UnicodeDecodeError):
                    print('STOP: malformed NDJSON line', file=sys.stderr)
                    return 2
                if not isinstance(doc, dict) or not isinstance(doc.get('_type'), str):
                    print('STOP: unexpected NDJSON record', file=sys.stderr)
                    return 2
                if doc['_type'] != 'inventoryMovement':
                    continue
                if not isinstance(doc.get('_id'), str) or not doc['_id'].startswith('inventoryMovement.'):
                    print('STOP: inventory record ID invalid', file=sys.stderr)
                    return 2
                print(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), flush=False)
                count += 1
    print(f'Extractor finished: {count} inventoryMovement records read', file=sys.stderr)
    return 0

if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (OSError, tarfile.TarError) as exc:
        print(f'STOP: backup read failed ({type(exc).__name__})', file=sys.stderr)
        raise SystemExit(2)
