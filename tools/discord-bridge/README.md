# CineLoop Activity Bridge (Windows)

Il bridge collega l'estensione CineLoop a Discord Rich Presence. Funziona localmente, senza backend a pagamento. Discord desktop e l'estensione CineLoop devono essere attivi.

## Installazione (un solo installer)

1. Installa Python 3.11 o superiore da https://www.python.org/downloads/windows/ e seleziona **Add Python to PATH**.
2. Crea un'app su https://discord.com/developers/applications, copia il suo **Application ID** e incollalo in `start.bat`, sostituendo `INSERISCI_QUI_APPLICATION_ID`.
3. Fai doppio clic su `install_silent.bat`. Installa le dipendenze, configura l'avvio silenzioso a ogni accesso a Windows e prova ad avviare il bridge subito.

Non servono privilegi amministrativi. Non sovrascrivere `start.bat` dopo aver inserito il tuo Application ID.

## Diagnostica e rimozione

- Gli eventuali errori dell'avvio silenzioso sono registrati in `bridge.log`.
- Per avviare manualmente con una finestra di diagnostica, fai doppio clic su `start.bat`.
- Per rimuovere l'avvio automatico, apri **Gestione attività → App di avvio** o elimina la voce `CineLoopDiscordBridge` da `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run`.

## Note

- Il bridge ascolta solo su `127.0.0.1:32145`, non sulla rete locale.
- In Discord abilita **Activity Privacy → Share your detected activities with others** (la dicitura può variare).
- Il bridge invia il titolo e le informazioni dell'episodio, non URL di visione o credenziali.
- Per mostrare il logo piccolo, carica l'asset `cineloop_logo` nell'area Art Assets del Discord Developer Portal.
- L'Application ID non è una password; non servono token o credenziali private.
