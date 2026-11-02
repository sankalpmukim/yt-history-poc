#!/usr/bin/env python3
"""Tiny capture server: logs any POST body to /tmp/yt-poc-dumps/ for debugging the extension."""
import http.server, os, datetime

OUT = "/private/tmp/opencode/yt-poc-dumps"
os.makedirs(OUT, exist_ok=True)

class H(http.server.BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()
    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n)
        ts = datetime.datetime.now().strftime("%H%M%S-%f")[:-3]
        name = self.path.strip("/").replace("/", "_") or "root"
        path = os.path.join(OUT, f"{ts}-{name}.json")
        with open(path, "wb") as f:
            f.write(body)
        print(f"captured {len(body)} bytes -> {path}", flush=True)
        self.send_response(200); self._cors()
        self.send_header("Content-Type", "text/plain"); self.end_headers()
        self.wfile.write(b"ok")
    def log_message(self, *a):
        pass

if __name__ == "__main__":
    http.server.HTTPServer(("127.0.0.1", 8742), H).serve_forever()
