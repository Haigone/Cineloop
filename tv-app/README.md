# CineLoop TV

App companion per Android TV / Fire TV, separata dall'interfaccia social del sito. La prima versione apre l'esperienza TV ospitata dal backend CineLoop, così account, libreria e wishlist restano quelli già esistenti.

## Prima versione

- Home, Libreria, Esplora e Wishlist
- Navigazione con telecomando e focus ben visibile
- Stato della libreria e wishlist aggiornati tramite le azioni del sito
- Nessun database locale duplicato e nessun nuovo account
- Shell Android TV WebView installabile come APK quando è configurato l'URL pubblico di CineLoop

## Installazione

L'APK va generato per l'URL HTTPS effettivo del sito. Non inserire credenziali o token nel codice. La build accetta `-PcineloopUrl=https://IL-DOMINIO-DEL-SITO/tv`.

Dopo aver generato l'APK, copiarlo su una chiavetta USB e aprirlo da un file manager compatibile sul dispositivo Android TV/Fire TV, abilitando l'installazione da origini sconosciute se richiesto. In alternativa, su dispositivi che supportano ADB, si può installare con `adb install`.

**Nota:** una chiavetta USB non esegue da sola l'app: serve un dispositivo TV compatibile con Android/Fire OS. Sky Glass non permette l'installazione libera di APK; per usarla lì sarebbe necessario un dispositivo HDMI compatibile esterno.

## Stato

La route web `/tv` è servita dal sito principale e usa la sessione CineLoop esistente. La shell Android è un wrapper leggero, non una seconda implementazione del backend.
