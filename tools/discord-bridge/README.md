# CineLoop Activity Bridge (Windows 11)

Piccolo programma locale che riceve lo stato di CineLoop dall'estensione e lo pubblica tramite Discord Rich Presence. Non richiede un backend a pagamento. Discord desktop deve essere aperto e il bridge deve restare in esecuzione.

## 1. Crea l'app Discord

1. Apri https://discord.com/developers/applications e accedi.
2. Premi **New Application**, chiamala `CineLoop`.
3. Nella pagina **General Information**, copia **Application ID**.
4. Apri `start.bat` con Blocco note e sostituisci `INSERISCI_QUI_APPLICATION_ID` con l'ID copiato. Non pubblicare token o credenziali: serve solo l'Application ID.

## 2. Installa

1. Installa Python 3.11+ da https://www.python.org/downloads/windows/ e durante l'installazione seleziona **Add Python to PATH**.
2. Scarica la cartella `tools/discord-bridge` dal repository CineLoop (Code → Download ZIP, oppure scarica i singoli file).
3. Estrai la cartella, poi fai doppio clic su `install.bat`.
4. Apri Discord desktop e poi fai doppio clic su `start.bat`. Lascia la finestra aperta.

## 3. Collega l'estensione

L'estensione CineLoop deve essere aggiornata alla versione che include il collegamento Activity Bridge. Apri o ricarica una scheda di Netflix, AnimeUnity o StreamingCommunity supportata. Quando CineLoop riconosce un titolo, Discord può mostrare titolo e episodio nel profilo. Quando non c'è un titolo riconosciuto, l'attività viene cancellata.

## Note

- Il bridge ascolta esclusivamente su `127.0.0.1:32145`, non sulla rete locale.
- In Discord, abilita **Activity Privacy → Share your detected activities with others** (la dicitura può variare).
- Il bridge trasmette titolo e informazioni episodio, non URL di visione o credenziali.
- Se vuoi rimuoverlo, chiudi la finestra e cancella la cartella. Per disinstallare il pacchetto Python non è necessario modificare Windows.
- L'Application ID è tuo e gratuito. L'applicazione deve esistere nel Developer Portal prima di avviare il bridge.
