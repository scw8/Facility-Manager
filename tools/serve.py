"""개발용 로컬 서버. 브라우저가 옛 JS 파일을 캐시에 남겨 두지 않도록 매번 새로 받게 한다.

사용법: python3 tools/serve.py [포트]   (기본 8123)
"""

import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    http.server.ThreadingHTTPServer(("", port), NoCacheHandler).serve_forever()
