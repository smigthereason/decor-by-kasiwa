#!/usr/bin/env python3
"""Apply only the signed Meta outbound payload change to the current local Worker.
Preserves the existing provider selection, HMAC, recipient allowlist and migration changes.
"""
from pathlib import Path
import argparse, re, subprocess, tempfile
p=Path('infra/dbk36/production-worker/dbk36-prod-worker.mjs')
parser=argparse.ArgumentParser();parser.add_argument('--apply',action='store_true');args=parser.parse_args()
s=p.read_text()
if 'DBK155_META_IMAGE_PAYLOAD' in s:
    print('DBK155 media already installed; no change.');raise SystemExit(0)
# Find the single Meta Graph outbound JSON payload, rather than a YCloud payload.
pattern='(?P<prefix>JSON\\.stringify\\(\\{\\s*messaging_product\\s*:\\s*[\'\\"]whatsapp[\'\\"]\\s*,\\s*messaging_account_id\\s*:\\s*env\\.WHATSAPP_WABA_ID\\s*,\\s*recipient_type\\s*:\\s*[\'\\"]individual[\'\\"]\\s*,\\s*to\\s*,\\s*)type\\s*:\\s*[\'\\"]text[\'\\"]\\s*,\\s*text\\s*:\\s*\\{\\s*preview_url\\s*:\\s*false\\s*,\\s*body\\s*:\\s*data\\.text\\s*\\}(?P<suffix>\\s*\\}\\))'
matches=list(re.finditer(pattern,s))
if len(matches)!=1: raise SystemExit('STOP: unexpected current Meta payload; no files changed. Share only the outbound handler source, without secrets.')
m=matches[0]
# The current implementation must have the signed and restricted outbound perimeter.
if '/__dbk36/send' not in s or 'DBK36_META_PUBLIC_BOT' not in s or 'DBK36_META_TEST_NUMBERS' not in s or 'x-dbk36-signature' not in s:
    raise SystemExit('STOP: current Worker is not the expected restricted Meta version; no change.')
# Check the payload uses data.to and existing text validation. The image URL is only from Sanity CDN.
if not re.search(r'\bto\s*,\s*$', m.group('prefix')) or 'data.text' not in s: raise SystemExit('STOP: unexpected outbound body.')
expr="""/* DBK155_META_IMAGE_PAYLOAD */ ...(() => {
          if (data.imageUrl === undefined) return {type:'text',text:{preview_url:false,body:data.text}};
          if (typeof data.imageUrl !== 'string' || data.imageUrl.length > 1500 || data.text.length > 1024) throw new Error('DBK155_MEDIA_INVALID');
          const image = new URL(data.imageUrl);
          if (image.protocol !== 'https:' || image.hostname !== 'cdn.sanity.io' || image.username || image.password || image.port || !image.pathname.startsWith('/images/')) throw new Error('DBK155_MEDIA_INVALID');
          return {type:'image',image:{link:image.toString(),caption:data.text}};
        })()"""
updated=s[:m.start()]+m.group('prefix')+expr+m.group('suffix')+s[m.end():]
with tempfile.TemporaryDirectory() as d:
    trial=Path(d)/'worker.mjs';trial.write_text(updated);subprocess.run(['node','--check',str(trial)],check=True)
if args.apply:
    p.write_text(updated);print('DBK155 media installed. Existing Meta authentication and recipient guard preserved. Not deployed.')
else: print('DBK155 media dry-run passed. No files changed. Use --apply after review.')
