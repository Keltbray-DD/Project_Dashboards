"""Local dev server: like `py -m http.server`, but tells the browser not to
cache anything. Plain http.server sends no cache headers, so browsers keep
ES modules for a while and you can end up running a mix of old and new
files after an edit.

Run from the project root:
    py dev/serve.py            # http://localhost:8000
    py dev/serve.py 8001       # another port (no Autodesk sign-in there:
                               # only port 8000 is registered for OAuth)
"""

import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler)
    print(f"Serving on http://localhost:{port} (no-store)")
    server.serve_forever()
