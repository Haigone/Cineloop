"""CineLoop Activity Bridge: localhost HTTP receiver -> Discord Rich Presence."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import threading
import time
from urllib.parse import urlparse

HOST = "127.0.0.1"
PORT = 32145
APP_ID = os.environ.get("CINELOOP_DISCORD_APP_ID", "").strip()
RPC = None
RPC_LOCK = threading.Lock()

def rpc_connect():
    global RPC
    if not APP_ID:
        return False
    try:
        from pypresence import Presence
        client = Presence(APP_ID)
        client.connect()
        RPC = client
        print("Connesso a Discord Rich Presence.")
        return True
    except Exception as exc:
        RPC = None
        print(f"Discord non disponibile: {exc}")
        return False

def clear_presence():
    global RPC
    with RPC_LOCK:
        try:
            if RPC:
                RPC.clear()
        except Exception:
            RPC = None

def publish(payload):
    global RPC
    watching = payload.get("watching") if isinstance(payload, dict) else None
    title_obj = (watching or {}).get("title") if isinstance(watching, dict) else None
    title = title_obj.get("title") if isinstance(title_obj, dict) else None
    if not title:
        clear_presence()
        return
    season = watching.get("season")
    episode = watching.get("episode")
    label = watching.get("label")
    details = str(title)[:128]
    state = str(label)[:128] if label else "Sta guardando su CineLoop"
    if season is not None and episode is not None:
        state = f"Stagione {season} · Episodio {episode}"
    elif episode is not None:
        state = f"Episodio {episode}"
    with RPC_LOCK:
        try:
            if RPC is None and not rpc_connect():
                return
            RPC.update(
                details=details,
                state=state,
                large_text="CineLoop",
                start=int(time.time()),
            )
        except Exception as exc:
            print(f"Impossibile aggiornare Discord: {exc}")
            RPC = None

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return
    def send_json(self, status, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin", "null"))
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin", "null"))
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
    def do_POST(self):
        if self.path != "/presence":
            self.send_json(404, {"ok": False})
            return
        origin = self.headers.get("Origin", "")
        if not origin.startswith("chrome-extension://"):
            self.send_json(403, {"ok": False, "error": "extension_only"})
            return
        try:
            length = min(int(self.headers.get("Content-Length", "0")), 32768)
            payload = json.loads(self.rfile.read(length))
            threading.Thread(target=publish, args=(payload,), daemon=True).start()
            self.send_json(200, {"ok": True})
        except Exception:
            self.send_json(400, {"ok": False, "error": "invalid_json"})

def main():
    if not APP_ID:
        print("Manca CINELOOP_DISCORD_APP_ID. Configuralo in start.bat seguendo README.md.")
    else:
        threading.Thread(target=rpc_connect, daemon=True).start()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"CineLoop Activity Bridge attivo su http://{HOST}:{PORT}")
    print("Lascia questa finestra aperta mentre guardi.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        clear_presence()
        server.server_close()

if __name__ == "__main__":
    main()
