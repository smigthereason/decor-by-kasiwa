#!/usr/bin/env python3
"""DBK-36: restricted local Cloudflare ingress. Only the signed Meta webhook is exposed.

Do not tunnel directly to Next.js. Point cloudflared to http://127.0.0.1:8787.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from http.client import HTTPConnection
from urllib.parse import urlsplit
import os
import re

HOST = '127.0.0.1'
LISTEN = int(os.environ.get('DBK36_GATEWAY_PORT', '8787'))
UPSTREAM = int(os.environ.get('DBK36_NEXT_PORT', '3100'))
WEBHOOK = '/api/whatsapp/webhook'
MAX_BYTES = 262_144
SIGNATURE = re.compile(r'^sha256=[a-fA-F0-9]{64}$')

class OnlyWhatsApp(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt, *args):
        # Do not print URL query strings (Meta's verify token is there).
        print(f'[DBK-36 gateway] {self.command} {self.path.split("?")[0]} -> handled', flush=True)

    def respond(self, code, content=b'', ctype='text/plain; charset=utf-8'):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Connection', 'close')
        self.end_headers()
        if content and self.command != 'HEAD':
            self.wfile.write(content)
        self.close_connection = True

    def dispatch(self):
        target = urlsplit(self.path)
        if target.scheme or target.netloc or target.path != WEBHOOK:
            return self.respond(404, b'Not found')
        if self.command == 'GET':
            # Only allow Meta's handshake request; Next handles secret comparison.
            if 'hub.mode=subscribe' not in target.query:
                return self.respond(404, b'Not found')
            body = None
            headers = {'Accept': 'text/plain'}
        elif self.command == 'POST':
            signature = self.headers.get('X-Hub-Signature-256', '')
            if not SIGNATURE.fullmatch(signature):
                return self.respond(401, b'Invalid signature')
            if 'application/json' not in self.headers.get('Content-Type', '').lower():
                return self.respond(415, b'JSON required')
            if self.headers.get('Transfer-Encoding'):
                return self.respond(400, b'Chunked requests not supported')
            try:
                size = int(self.headers.get('Content-Length', '-1'))
            except ValueError:
                return self.respond(400, b'Invalid length')
            if size < 0 or size > MAX_BYTES:
                return self.respond(413, b'Invalid payload length')
            body = self.rfile.read(size)
            headers = {'Content-Type': 'application/json', 'X-Hub-Signature-256': signature}
        else:
            return self.respond(405, b'Method not allowed')

        connection = HTTPConnection(HOST, UPSTREAM, timeout=20)
        try:
            connection.request(self.command, self.path, body=body, headers=headers)
            result = connection.getresponse()
            payload = result.read(MAX_BYTES + 1)
            if len(payload) > MAX_BYTES:
                return self.respond(502, b'Upstream response too large')
            self.respond(result.status, payload, result.getheader('Content-Type', 'text/plain'))
        except (OSError, TimeoutError):
            self.respond(502, b'Local Next.js app unavailable')
        finally:
            connection.close()

    do_GET = dispatch
    do_POST = dispatch
    do_HEAD = dispatch
    do_PUT = dispatch
    do_DELETE = dispatch
    do_OPTIONS = dispatch
    do_PATCH = dispatch

if __name__ == '__main__':
    server = ThreadingHTTPServer((HOST, LISTEN), OnlyWhatsApp)
    print(f'[DBK-36 gateway] Listening on http://{HOST}:{LISTEN}', flush=True)
    print(f'[DBK-36 gateway] Only GET/POST {WEBHOOK} forwarded to 127.0.0.1:{UPSTREAM}', flush=True)
    server.serve_forever()
