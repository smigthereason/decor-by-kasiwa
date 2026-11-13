#!/usr/bin/env python3
"""Stream auditEvent and inventoryMovement from a Sanity tar.gz dataset export.
Read-only; prints selected NDJSON objects to stdout, not secrets or metadata.
"""
import json
import sys
import tarfile

if len(sys.argv) != 2:
    sys.exit('Usage: dbk98_extract_docs.py <private Sanity export.tar.gz>')
path = sys.argv[1]
count = 0
checked = 0
with tarfile.open(path, mode='r:gz') as tf:
    members = [m for m in tf.getmembers() if m.isfile() and
               (m.name.endswith('.ndjson') or m.name.endswith('.jsonl'))]
    if not members:
        sys.exit('STOP: No NDJSON in Sanity export. No deletion permitted.')
    for member in members:
        handle = tf.extractfile(member)
        if handle is None:
            continue
        for raw in handle:
            if not raw.strip():
                continue
            checked += 1
            doc = json.loads(raw)
            if isinstance(doc, dict) and doc.get('_type') in ('auditEvent','inventoryMovement'):
                if not isinstance(doc.get('_id'), str) or not isinstance(doc.get('_rev'),str):
                    sys.exit('STOP: Document missing source revision')
                print(json.dumps(doc, separators=(',', ':'), ensure_ascii=False))
                count += 1
if not checked or not count:
    sys.exit('STOP: No usable production audit/movement records found')
