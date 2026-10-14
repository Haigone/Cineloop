# Estensione browser

Stato: **disponibile per Netflix, AnimeUnity e StreamingCommunity** su Chrome, Edge, Brave e altri browser Chromium, e su **Firefox 140+** (dalla 0.6.0). Il codice è in `extension/`; `npm run build` lo impacchetta in `public/cineloop-extension.zip` (Chromium) e `public/cineloop-extension-firefox.zip` (Firefox), che il sito offre in Impostazioni > Estensione Netflix.

Il codice è lo stesso per i due browser. Il pacchetto Firefox cambia solo il manifest (`scripts/pack-extension.ts`): pagina di background invece del service worker, id del componente aggiuntivo (`cineloop@cineloop-one.vercel.app`) e dichiarazione dei dati raccolti. `compat.js`, caricato per primo in ogni pagina e script, fa usare a Firefox il suo namespace `browser.*` dove il codice scrive `chrome.*`.

## Permessi

- **netflix.com è chiesto all'installazione** (dalla 0.6.0, `host_permissions`): il browser lo mostra una volta quando aggiungi l'estensione e poi non serve autorizzare nulla dal pannello. Per non farsi vedere si usa "Metti in pausa".
- AnimeUnity e StreamingCommunity restano facoltativi e si attivano dal pannello, come prima.
- Su Firefox l'utente può revocare netflix.com da about:addons: in quel caso il pannello mostra di nuovo il pulsante "Consenti su netflix.com".

## Cosa fa

- **Aggiorna CineLoop mentre guardi.** Il titolo passa a "In corso" con il link per riprendere sul provider rilevato, sparisce dalla wishlist e il tempo di visione entra nelle statistiche.
- **Ti mostra agli amici, se vuoi.** Il pannello ha tre sezioni (dalla 0.6.0 la Watchlist non c'è più: la wishlist si gestisce sul sito). In *Sto guardando* c'è cosa stai guardando (con stagione ed episodio). In *Importa* puoi portare su CineLoop *La mia lista* di Netflix (vedi sotto). In *Guarda insieme* c'è l'interruttore **Visibile agli amici** (anche in Impostazioni > Privacy): se è attivo, nella loro dashboard compari in "I tuoi amici stanno guardando" con il pulsante **Guarda insieme**.
- **Guardare insieme** (dalla 0.3.0; posizione sincronizzata dalla 0.6.1, solo Netflix). Chi preme "Guarda insieme" apre lo stesso episodio dal proprio account Netflix, con un link `?t=` che parte dal punto in cui è l'host. Finché siete nella stanza, `party-sync.js` riporta ogni 2 secondi posizione e play/pausa del `<video>` di ciascuno a `POST /api/extension/party`, che risponde con l'orologio della stanza (`src/domain/party.ts`: segue il player dell'host, ma solo quando quel player ha già ricevuto lo stato della stanza ed è vicino al suo punto, così l'autoplay di una pagina appena riaperta non annulla la pausa di un amico; un play, una pausa o un salto premuti da chiunque lo spostano per tutti; se l'host passa a un altro episodio la stanza riparte da lì). Ogni player si tiene su quell'orologio: play e pausa vengono applicati; uno scarto da 1 a 8 secondi si recupera accelerando o rallentando un poco (`playbackRate`); oltre gli 8 secondi l'episodio viene riaperto al punto della stanza con `?t=`. Non viene mai impostato `currentTime` (il player di Netflix va in errore) né usata un'API interna di Netflix. Se Netflix ignora `?t=`, la scheda smette di riprovare e il pannello dice di quanti secondi siete sfasati. Su AnimeUnity e StreamingCommunity la stanza non si sincronizza. Chi preferisce un'estensione watch party esterna può ancora condividerne il link.

## Cosa legge

Per le schede dei servizi che hai autorizzato, e solo quelle:

- l'indirizzo della pagina (es. `https://www.netflix.com/watch/80077368`, una pagina StreamingCommunity `/titles/{id}` oppure `/it/watch/{id}?e={episodeId}`);
- il titolo della scheda (spesso è solo "Netflix");
- se la scheda sta riproducendo audio (dopo 10 minuti di silenzio l'estensione smette di segnalarti);
- **cosa è in riproduzione, come lo nomina il player** (dalla versione 0.2.0, 8 ottobre 2026, su richiesta del proprietario del progetto): il nome della serie o del film e la riga "S4:E5". `player-title.js` legge solo due cose sulle pagine `/watch`: i metadati multimediali che la pagina passa al browser (gli stessi dei controlli multimediali del browser) e la riga del titolo del player (`[data-uia="video-title"]`). Così serie, stagione ed episodio si riconoscono senza chiedere nulla.

Dall'indirizzo delle pagine di catalogo (`?jbv=` o `/title/`) ricorda l'id della serie da cui sei partito, così riconosce le puntate successive anche senza il nome dal player.

## Cosa non legge, mai

- Cookie, localStorage, token, header o richieste di rete.
- Il resto della pagina: elenchi, "La mia lista", cronologia, profilo, il flusso video o i sottotitoli. Lo script non modifica la pagina, non comanda il player e non fa richieste; gira solo su www.netflix.com dopo che l'utente ha concesso il permesso.
- Non invia al server gli URL di altri siti. Per riconoscere un nuovo dominio dalla scheda aperta dall'utente, il permesso `tabs` rende disponibili i metadati URL delle schede; il codice li usa solo per riconoscere URL HTTPS con host StreamingCommunity e percorso di riproduzione valido. Leggere il contenuto della pagina richiede comunque il permesso host specifico, richiesto dal pannello con un clic.

Non fa alcuna richiesta a Netflix: parla solo con il server CineLoop scelto dall'utente.

### StreamingCommunity

Dopo il consenso alla directory `streaming-community.how`, l'estensione segue il pulsante “StreamingCommunity” anche se reindirizza a un altro dominio. Se l'utente apre direttamente una pagina di riproduzione su un host nuovo e valido, memorizza automaticamente quell'origine; il browser richiede comunque un clic dell'utente per autorizzare il nuovo host prima di leggere la pagina. Lo script `sc-page.js` osserva `/titles/{id}` e `/it/watch/{id}?e={episodeId}`: legge l'intestazione visibile, i marcatori di stagione/episodio, l'ID episodio nella query e la frazione del video se il tag `video` è accessibile nello stesso documento o in un iframe same-origin. L'URL completo e il progresso sono inviati al server CineLoop abbinato. Non legge cookie, credenziali, richieste di rete o URL dei flussi.

## Come funziona

1. In Impostazioni l'utente genera un **codice monouso** (8 caratteri, valido 10 minuti, salvato solo come hash).
2. Nel pannello l’indirizzo di CineLoop è già impostato su `https://cineloop-one.vercel.app`: basta inserire il codice (l’indirizzo resta modificabile). `POST /api/extension/pair` restituisce un **token del dispositivo**, casuale e revocabile da Impostazioni (anche questo salvato solo come hash). Le credenziali Netflix non sono mai coinvolte.
3. Con una scheda `/watch/{id}` aperta, il service worker invia ogni minuto una `SyncObservation` a `POST /api/extension/observe`:

```ts
interface SyncObservation {
  providerId: ProviderId;
  url: string;
  documentTitle: string;
  hints?: { title?: string; season?: number; episode?: number; episodeId?: string; progress?: number; parentId?: string };
  observedAt: string;
}
```

4. Il server passa l'osservazione a `NetflixAdapter`, che estrae l'id dall'indirizzo. Il titolo del catalogo si trova così, in ordine:
   1. un abbinamento già noto (`provider_title_links`) per l'id della puntata;
   2. una corrispondenza esatta del nome mostrato dal player (o del titolo della scheda) nel catalogo; con stagione ed episodio, solo tra le serie;
   3. un abbinamento già noto per l'id della serie da cui l'utente è partito;
   4. altrimenti il pannello chiede "Che cosa stai guardando?" e l'utente sceglie una volta. L'abbinamento vale poi per tutti, anche per le puntate successive. "Non è questo?" corregge un riconoscimento sbagliato.
5. La presenza (`presence`) resta viva finché arrivano i battiti; dopo 3 minuti di silenzio scade. Tornare al catalogo tra una puntata e l'altra non chiude la sessione: stanza e amici restano. Chiudere Netflix, mettere in pausa dal pannello o scollegare la chiude subito.

## API

Tutte le chiamate usano `Authorization: Bearer <token>`. CORS è aperto solo alle origini `chrome-extension://` e simili; il token non è un cookie, quindi una pagina web non può usarlo. Limite di 30 richieste al minuto per dispositivo, 10 tentativi di abbinamento al minuto per IP.

| Metodo | Percorso | A cosa serve |
|---|---|---|
| POST | `/api/extension/pair` | Codice monouso → token del dispositivo |
| POST | `/api/extension/observe` | Battito dalla scheda in riproduzione |
| POST | `/api/extension/confirm` | L'utente indica il titolo |
| GET | `/api/extension/search?q=` | Ricerca nel catalogo per la conferma |
| GET | `/api/extension/status` | Stato per il pannello |
| PATCH | `/api/extension/presence` | Condivide o toglie il link della stanza (solo `https`) |
| DELETE | `/api/extension/presence` | Fine della visione |

## Privacy

- "Condividi la tua attività" spento in Impostazioni: gli amici non ti vedono in visione, ma la tua libreria si aggiorna lo stesso.
- Solo gli amici possono unirsi, e chi ospita riceve una notifica (se ha attivato quelle delle serate).
- Pausa e scollegamento sono a un clic, dal pannello o da Impostazioni.

## Installazione

Finché l'estensione non è sul Chrome Web Store e su addons.mozilla.org:

1. Impostazioni > Estensione browser > scarica il pacchetto per il tuo browser.
2. **Chrome, Edge, Brave**: decomprimi `cineloop-extension.zip`, apri `chrome://extensions`, attiva "Modalità sviluppatore", scegli "Carica estensione non pacchettizzata" e seleziona la cartella `cineloop-extension`.
   **Firefox**: apri `about:debugging#/runtime/this-firefox`, scegli "Carica componente aggiuntivo temporaneo…" e seleziona `cineloop-extension-firefox.zip` così com'è. Un componente temporaneo resta finché Firefox non si chiude. Per un'installazione permanente il pacchetto va firmato da Mozilla: si carica su addons.mozilla.org come "distribuzione autonoma" (firma gratuita e automatica, serve un account sviluppatore) e si installa il file `.xpi` firmato. Su Firefox Developer Edition o Nightly, in alternativa, si può impostare `xpinstall.signatures.required` a `false` in `about:config`.
3. Apri l’estensione, inserisci il codice e premi Collega. L’indirizzo precompilato è `https://cineloop-one.vercel.app`.
4. Puoi attivare o disattivare Netflix, AnimeUnity e StreamingCommunity dalla sezione **Servizi collegati** del pannello; il consenso di un sito non nasconde più gli altri. Per StreamingCommunity l’estensione segue il pulsante della directory anche attraverso il reindirizzamento al dominio finale, poi chiede il permesso per quel dominio.

Per aggiornarla basta sostituire la cartella e premere "Ricarica" in `chrome://extensions` (su Firefox, "Ricarica" in `about:debugging`).

## Test

`tests/e2e/extension.spec.ts` carica l'estensione vera in Chromium, la collega, simula le pagine di netflix.com (nessuna richiesta esce verso Netflix), conferma un titolo, verifica che la puntata successiva sia riconosciuta e che un amico possa unirsi. La logica pura è in `tests/unit/presence.test.ts`, il servizio in `tests/unit/sync.test.ts`.


## Importare "La mia lista" di Netflix

Dalla sezione *Importa* del pannello. L'utente apre netflix.com/browse/my-list e scorre fino in fondo; il pannello legge, solo su sua richiesta e solo in quella scheda, il nome e l'id delle copertine già presenti nella pagina (`chrome.scripting.executeScript`, permesso netflix.com già concesso). Nessuna richiesta a Netflix, nessuno scorrimento automatico, nessuna API interna. I titoli vanno a `POST /api/extension/import-list` a gruppi di 20: ognuno è riconosciuto dall'id Netflix già noto, poi per nome (preferendo quello disponibile su Netflix) e finisce in wishlist, se non è già in wishlist o in libreria. Il pannello mostra quanti sono stati aggiunti e quali non sono stati trovati nel catalogo.

### Dall'export ufficiale dei dati di Netflix

Per liste lunghe, o per importare la lista di un altro profilo, il pannello offre anche l'export dei dati personali:

1. Su netflix.com: Account > Sicurezza e privacy > Scarica le tue informazioni personali (`netflix.com/account/getmyinfo`) e invia la richiesta.
2. Conferma dall'email di Netflix.
3. Quando arriva l'email che i dati sono pronti (Netflix dice fino a 30 giorni, di solito un giorno), scarica lo .zip.
4. Dal pannello, *Importa* > "Carica il file di Netflix": si apre `import.html` in una scheda (un selettore di file chiuderebbe il pannello). Si carica lo .zip così com'è oppure solo `MyList.csv`.

`netflix-export.js` legge lo .zip nel browser: apre solo la voce `CONTENT_INTERACTION/MyList.csv` (anche negli archivi ZIP64), ne prende profilo e titolo, e toglie i doppioni. Se ci sono più profili si sceglie quale importare (o tutti). I titoli vanno a `POST /api/extension/import-list` senza id Netflix, a gruppi di 20; al limite di richieste la pagina aspetta un minuto e riprende da sola. Se si carica la cronologia (`NetflixViewingHistory.csv` o `ViewingActivity.csv`) la pagina lo dice invece di importarla.
