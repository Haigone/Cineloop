"""CineLoop Activity Bridge: localhost HTTP receiver -> Discord Rich Presence."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import threading
from urllib.parse import urlparse

HOST = "127.0.0.1"
PORT = 32145
APP_ID = os.environ.get("CINELOOP_DISCORD_APP_ID", "").strip()
RPC = None
RPC_LOCK = threading.Lock()
LAST_ACTIVITY_KEY = None
LAST_WATCHING = None

def rpc_connect():
    global RPC
    if not APP_ID:
        return False
    try:
        from pypresence import Presence
        from pypresence.types import ActivityType
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
    global RPC, LAST_ACTIVITY_KEY, LAST_WATCHING
    watching = payload.get("watching") if isinstance(payload, dict) else None
    title_obj = (watching or {}).get("title") if isinstance(watching, dict) else None
    title = title_obj.get("title") if isinstance(title_obj, dict) else None
    season = watching.get("season") if isinstance(watching, dict) else None
    episode = watching.get("episode") if isinstance(watching, dict) else None
    label = watching.get("label") if isinstance(watching, dict) else None
    poster_url = watching.get("posterUrl") if isinstance(watching, dict) else None
    if not poster_url and isinstance(title_obj, dict):
        artwork = title_obj.get("artwork")
        poster_url = artwork.get("posterUrl") if isinstance(artwork, dict) else title_obj.get("posterUrl")
    if not isinstance(poster_url, str) or urlparse(poster_url).scheme != "https" or not urlparse(poster_url).netloc:
        poster_url = None

    # Variante 1: contenuto rilevato in questo momento.
    if title:
        LAST_WATCHING = {"title": str(title), "season": season, "episode": episode, "label": label, "posterUrl": poster_url or (LAST_WATCHING or {}).get("posterUrl")}
        active = True
    # Variante 2: nessuna visione attiva; conserva in memoria l'ultimo titolo rilevato.
    else:
        active = False

    remembered = LAST_WATCHING
    if not remembered:
        print("[PRESENZA] Nessun contenuto rilevato finora.", flush=True)
        clear_presence()
        LAST_ACTIVITY_KEY = None
        return

    remembered_title = remembered["title"]
    remembered_season = remembered.get("season")
    remembered_episode = remembered.get("episode")
    remembered_label = remembered.get("label")
    remembered_poster = remembered.get("posterUrl")
    activity_key = (active, remembered_title, remembered_season, remembered_episode, remembered_label, remembered_poster)
    episode_text = f" — S{remembered_season} E{remembered_episode}" if remembered_season is not None and remembered_episode is not None else (f" — Episodio {remembered_episode}" if remembered_episode is not None else "")
    if active:
        print(f"[PRESENZA] ORA STA GUARDANDO: {remembered_title}{episode_text}", flush=True)
    else:
        print(f"[PRESENZA] ULTIMO CONTENUTO RILEVATO: {remembered_title}{episode_text} (nessuna visione attiva)", flush=True)

    if activity_key == LAST_ACTIVITY_KEY:
        return
    LAST_ACTIVITY_KEY = activity_key
    details = remembered_title[:128]
    if active:
        state = f"Ora sta guardando · Stagione {remembered_season}, episodio {remembered_episode}" if remembered_season is not None and remembered_episode is not None else (f"Ora sta guardando · Episodio {remembered_episode}" if remembered_episode is not None else "Ora sta guardando su CineLoop")
    else:
        state = f"Ultimo contenuto rilevato · Stagione {remembered_season}, episodio {remembered_episode}" if remembered_season is not None and remembered_episode is not None else (f"Ultimo contenuto rilevato · Episodio {remembered_episode}" if remembered_episode is not None else "Ultimo contenuto aperto · non in visione")
    with RPC_LOCK:
        try:
            if RPC is None and not rpc_connect():
                return
            from pypresence.types import ActivityType
            # Discord mostra la locandina del titolo se il provider fornisce un URL HTTPS.
            # Il testo alternativo resta disponibile quando non c'è una locandina.
            update_args = {
                "activity_type": ActivityType.LISTENING,
                "details": details,
                "state": state,
                "large_text": remembered_title[:128] if remembered_poster else "CineLoop",
            }
            if remembered_poster:
                update_args["large_image"] = remembered_poster
            RPC.update(**update_args)
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
