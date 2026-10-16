# CineLoop Bridge

Programmino per Windows che porta su Discord quello che guardi (Rich Presence "Sta guardando"). Sostituisce `tools/discord-bridge` (Python + `.bat`, che resta dov'è).

Nessuna finestra: solo un'icona accanto all'orologio. Clic destro:

- **Nascondi / Riprendi attività**: niente va su Discord finché è in pausa.
- **Titolo in evidenza**: cosa mostrare quando non guardi nulla. "Ultimo guardato" (automatico) oppure uno dei titoli visti di recente.
- **Riconnetti a Discord**, **Avvia con Windows** (spento di default), **Apri CineLoop**, **Esci**.

Mentre guardi mostra sempre il titolo in corso. Quando smetti, mostra il titolo in evidenza o l'ultimo guardato (come il bridge Python).

## Come funziona

L'estensione CineLoop fa `POST http://127.0.0.1:32145/presence` (stesso protocollo di prima, nessuna modifica all'estensione). Il programma ascolta solo su localhost, accetta solo origini `chrome-extension://` e `moz-extension://`, e pubblica la Rich Presence tramite l'IPC locale di Discord. Niente token, niente scraping. Una sola istanza: se la porta è occupata, il secondo avvio esce.

Impostazioni e titoli recenti: `%APPDATA%\CineLoop Bridge\config.json`.

## Application ID Discord

Ordine di ricerca: variabile `CINELOOP_DISCORD_APP_ID`, poi `app_id` nel `config.json`, poi il valore incluso in compilazione (`CINELOOP_DISCORD_APP_ID=... cargo build --release`). Per mostrare il logo piccolo carica l'asset `cineloop_logo` nel Developer Portal.

## Sviluppo

```
cd tools/cineloop-bridge
cargo test            # logica, funziona ovunque
cargo build --release # su Windows (CI: .github/workflows/build-bridge.yml)
```

Rilascio (installer, firma, aggiornamenti): da fare, vedi il piano nel thread.
