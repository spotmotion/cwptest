import http.server
import socketserver
import sys
from pathlib import Path
import os
import errno
from time import sleep

PORT = 8000

demoes_dir = Path(__file__).parent
wasm_lib_dir = demoes_dir / 'wasm-lib'

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=demoes_dir, **kwargs)
    
    def end_headers(self):
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        super().end_headers()
    
    def translate_path(self, path):
        # Handle requests for WASM files from the local wasm-lib directory
        if path == '/CavalryWasm.js' or path == '/wasm-lib/CavalryWasm.js':
            return str(wasm_lib_dir / 'CavalryWasm.js')
        elif path == '/CavalryWasm.wasm' or path == '/wasm-lib/CavalryWasm.wasm':
            return str(wasm_lib_dir / 'CavalryWasm.wasm')
        elif path == '/CavalryWasm.data' or path == '/wasm-lib/CavalryWasm.data':
            return str(wasm_lib_dir / 'CavalryWasm.data')
        else:
            return super().translate_path(path)

Handler.extensions_map['.js'] = 'application/javascript'
Handler.extensions_map['.wasm'] = 'application/wasm'
Handler.extensions_map['.cv'] = 'application/octet-stream'
Handler.extensions_map['.jpg'] = 'image/jpeg'
Handler.extensions_map['.jpeg'] = 'image/jpeg'
Handler.extensions_map['.png'] = 'image/png'
Handler.extensions_map['.ttf'] = 'font/ttf'
Handler.extensions_map['.otf'] = 'font/otf'
Handler.extensions_map['.woff'] = 'font/woff'
Handler.extensions_map['.woff2'] = 'font/woff2'

def find_available_port(start_port=8000, max_attempts=10):
    """Find an available port starting from start_port."""
    for port in range(start_port, start_port + max_attempts):
        try:
            # Just test if the port is available
            test_server = socketserver.TCPServer(("", port), Handler)
            test_server.server_close()  # Close the test server immediately
            return port  # Port is available
        except OSError as e:
            if e.errno == errno.EADDRINUSE:
                continue
            else:
                raise
    
    print(f"Could not find an available port in range {start_port}-{start_port + max_attempts - 1}")
    sys.exit(1)

# Find an available port
port = find_available_port(PORT)

# Create the actual server
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(("", port), Handler)
print(f"Serving Cavalry Web Player at http://localhost:{port}/")

try:
    httpd.serve_forever()
except KeyboardInterrupt:
    print("\nShutting down...")
finally:
    httpd.shutdown()
    httpd.server_close()