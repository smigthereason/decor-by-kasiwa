#!/usr/bin/env python3
"""Stream inventoryMovement JSON from a private raw Sanity export. Do not print to terminal."""
import json,sys,tarfile
from pathlib import Path
if len(sys.argv)!=2: raise SystemExit('expected archive path')
with tarfile.open(sys.argv[1], 'r:gz') as t:
    mem=[m for m in t.getmembers() if m.isfile() and Path(m.name).name=='data.ndjson']
    if len(mem)!=1: raise SystemExit('expected exactly one data.ndjson')
    stream=t.extractfile(mem[0]);assert stream
    for raw in stream:
        if len(raw)>2000000: raise SystemExit('unexpected document size')
        if not raw.strip():continue
        doc=json.loads(raw)
        if doc.get('_type')!='inventoryMovement':continue
        if not doc.get('_id') or not doc.get('_rev'):raise SystemExit('invalid movement')
        print(json.dumps(doc,ensure_ascii=False,separators=(',',':')))
