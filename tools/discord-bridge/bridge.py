"""CineLoop Activity Bridge: localhost HTTP receiver -> Discord Rich Presence."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import threading
import time
from datetime import datetime
from urllib.parse import urlparse

HOST = "127.0.0.1"
PORT = 32145
APP_ID = os.environ.get("CINELOOP_DISCORD_APP_ID", "").strip()
RPC = None
RPC_LOCK = threading.Lock()
HISTORY_FILE = os.path.join(os.path.dirname(__file__), "activity-history.jsonl")
LAST_ACTIVITY_KEY = None

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
    global RPC, LAST_ACTIVITY_KEY
    watching = payload.get("watching") if isinstance(payload, dict) else None
    title_obj = (watching or {}).get("title") if isinstance(watching, dict) else None
    title = title_obj.get("title") if isinstance(title_obj, dict) else None
    season = watching.get("season") if isinstance(watching, dict) else None
    episode = watching.get("episode") if isinstance(watching, dict) else None
    label = watching.get("label") if isinstance(watching, dict) else None
    timestamp = datetime.now().astimezone().isoformat(timespec="seconds")
    record = {"timestamp": timestamp, "active": bool(title), "title": title, "label": label, "season": season, "episode": episode}
    try:
        with open(HISTORY_FILE, "a", encoding="utf-8") as history:
            history.write(json.dumps(record, ensure_ascii=False) + "\n")
    except OSError as exc:
        print(f"[STORICO] Errore scrittura: {exc}", flush=True)
    if title:
        episode_text = f" — S{season} E{episode}" if season is not None and episode is not None else (f" — Episodio {episode}" if episode is not None else "")
        print(f"[{timestamp}] ORA STA GUARDANDO: {title}{episode_text}", flush=True)
    else:
        print(f"[{timestamp}] Nessun titolo riconosciuto: attività Discord da cancellare.", flush=True)
    activity_key = (title, season, episode, label)
    if not title:
        LAST_ACTIVITY_KEY = None
        clear_presence()
        return
    if activity_key == LAST_ACTIVITY_KEY:
        return
    LAST_ACTIVITY_KEY = activity_key
    details = str(title)[:128]
    state = str(label)[:128] if label else "Ora sta guardando su CineLoop"
    if season is not None and episode is not None:
        state = f"Ora sta guardando · Stagione {season}, episodio {episode}"
    elif episode is not None:
        state = f"Ora sta guardando · Episodio {episode}"
    with RPC_LOCK:
        try:
            if RPC is None and not rpc_connect():
                return
            RPC.update(details=details, state=state, large_text="CineLoop")
        except Exception as exc:
            print(f"Impossibile aggiornare Discord: {exc}", flush=True)
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
            print(f"[RICEVUTO] Richiesta dall'estensione CineLoop ({length} byte)", flush=True)
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
    print(f"CineLoop Activity Bridge attivo su http://{HOST}:{PORT}", flush=True)
    print(f"Storico attività: {HISTORY_FILE}", flush=True)
    print("In attesa di dati dall'estensione CineLoop... lascia questa finestra aperta.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        clear_presence()
        server.server_close()

if __name__ == "__main__":
    main()
