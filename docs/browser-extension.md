# Estensione browser

Stato: **disponibile per Netflix, Prime Video (dalla 0.6.6), AnimeUnity e StreamingCommunity** su Chrome, Edge, Brave e altri browser Chromium, e su **Firefox 140+** (dalla 0.6.0). Il codice è in `extension/`; `npm run build` lo impacchetta in `public/cineloop-extension.zip` (Chromium) e `public/cineloop-extension-firefox.zip` (Firefox), che il sito offre in Impostazioni > Estensione Netflix.

Il codice è lo stesso per i due browser. Il pacchetto Firefox cambia solo il manifest (`scripts/pack-extension.ts`): pagina di background invece del service worker, id del componente aggiuntivo (`cineloop@cineloop-one.vercel.app`) e dichiarazione dei dati raccolti. `compat.js`, caricato per primo in ogni pagina e script, fa usare a Firefox il suo namespace `browser.*` dove il codice scrive `chrome.*`.

## Permessi

- **netflix.com è chiesto all'installazione** (dalla 0.6.0, `host_permissions`): il browser lo mostra una volta quando aggiungi l'estensione e poi non serve autorizzare nulla dal pannello. Per non farsi vedere si usa "Metti in pausa".
- AnimeUnity e StreamingCommunity restano facoltativi e si attivano dal pannello, come prima.
- **Prime Video è chiesto all'installazione** (dalla 0.6.6): `https://www.primevideo.com/*` e `https://www.amazon.it/gp/video/*` sono in `host_permissions` e `prime-page.js` è uno script dichiarato nel manifest. Su Chrome un'estensione installata dallo .zip ("Carica estensione non pacchettizzata") riceve i nuovi permessi con l'aggiornamento; su Firefox 140+ i `host_permissions` sono concessi all'installazione, ma un aggiornamento che ne aggiunge li mostra in una richiesta da accettare una volta. AnimeUnity e StreamingCommunity restano facoltativi (vedi [providers.md](./providers.md)): StreamingCommunity cambia dominio e il permesso va chiesto ogni volta per il dominio nuovo.
- **AnimeUnity e StreamingCommunity**: oltre al permesso del browser serve la scelta dell'utente sul sito. La prima volta che l'estensione ne vede uno, CineLoop mostra un avviso (poi si cambia da Impostazioni > Siti non ufficiali); finché non è accettato il server scarta quelle osservazioni e il pannello lo dice (`consent` nello stato). Vedi [providers.md](./providers.md).
- **Prime Video**: il player si apre sopra la pagina del titolo, quindi `prime-page.js` dice al background quando il player è aperto (ogni 20 secondi) e cosa nomina: serie, "Stagione 1, Ep. 3", punto raggiunto (dall'indicatore del tempo o dal `<video>`). L'osservazione arriva a `PrimeVideoAdapter` con l'indirizzo della scheda.
- Su Firefox l'utente può revocare netflix.com da about:addons: in quel caso il pannello mostra di nuovo il pulsante "Consenti su netflix.com".

## Cosa fa

- **Aggiorna CineLoop mentre guardi.** Il titolo passa a "In corso" con il link per riprendere sul provider rilevato, sparisce dalla wishlist e il tempo di visione entra nelle statistiche.
- **Ti mostra agli amici, se vuoi.** Il pannello ha tre sezioni (dalla 0.6.0 la Watchlist non c'è più: la wishlist si gestisce sul sito). In *Sto guardando* c'è cosa stai guardando (con stagione ed episodio). In *Importa* puoi portare su CineLoop *La mia lista* di Netflix (vedi sotto). In *Guarda insieme* c'è l'interruttore **Visibile agli amici** (anche in Impostazioni > Privacy): se è attivo, nella loro dashboard compari in "I tuoi amici stanno guardando" con il pulsante **Guarda insieme**.
- **Guardare insieme** (dalla 0.3.0; posizione sincronizzata dalla 0.6.1, salto con il player di Netflix dalla 0.6.3, solo Netflix). Chi preme "Guarda insieme" apre lo stesso episodio dal proprio account Netflix, con un link `?t=` che parte dal punto in cui è l'host. Finché siete nella stanza, `party-sync.js` riporta ogni 2 secondi posizione e play/pausa del `<video>` di ciascuno a `POST /api/extension/party`, che risponde con l'orologio della stanza (`src/domain/party.ts`: segue il player dell'host, ma solo quando quel player ha già ricevuto lo stato della stanza ed è vicino al suo punto, così l'autoplay di una pagina appena aperta non annulla la pausa di un amico; un play, una pausa o un salto premuti da chiunque lo spostano per tutti; se l'host passa a un altro episodio la stanza riparte da lì). Ogni player si tiene su quell'orologio come fa Teleparty (14 ottobre 2026, decisione del proprietario): play, pausa e salti oltre i 2 secondi passano dal **player interno di Netflix** (`netflix-player.js`, che gira nella pagina, "world" MAIN, e chiama `seek`/`play`/`pause` di `netflix.appContext…videoPlayer`); uno scarto da 1 a 2 secondi si recupera accelerando o rallentando un poco (`playbackRate`). Se il player di Netflix non risponde (codice interno, non documentato, può cambiare) si usa l'elemento `<video>` e, oltre gli 8 secondi, l'episodio viene riaperto al punto della stanza con `?t=`. Non viene mai impostato `currentTime` (il player di Netflix va in errore). Su AnimeUnity e StreamingCommunity la stanza non si sincronizza. Chi preferisce un'estensione watch party esterna può ancora condividerne il link.

## Cosa legge

Per le schede dei servizi che hai autorizzato, e solo quelle:

- l'indirizzo della pagina (es. `https://www.netflix.com/watch/80077368`, una pagina StreamingCommunity `/titles/{id}` oppure `/it/watch/{id}?e={episodeId}`);
- il titolo della scheda (spesso è solo "Netflix");
- se la scheda sta riproducendo audio (dopo 10 minuti di silenzio l'estensione smette di segnalarti);
- **cosa è in riproduzione, come lo nomina il player** (dalla versione 0.2.0, 8 ottobre 2026, su richiesta del proprietario del progetto): il nome della serie o del film e la riga "S4:E5". `player-title.js` legge solo due cose sulle pagine `/watch`: i metadati multimediali che la pagina passa al browser (gli stessi dei controlli multimediali del browser) e la riga del titolo del player (`[data-uia="video-title"]`). Così serie, stagione ed episodio si riconoscono senza chiedere nulla.

Dall'indirizzo delle pagine di catalogo (`?jbv=` o `/title/`) ricorda l'id della serie da cui sei partito, così riconosce le puntate successive anche senza il nome dal player.

## Cosa non legge, mai

- Cookie, localStorage, token, header o richieste di rete.
- Il resto della pagina: elenchi, "La mia lista", cronologia, profilo, il flusso video o i sottotitoli. Lo script non modifica la pagina e non fa richieste; comanda il player (salto, play, pausa) solo dentro una stanza di Guarda insieme; gira solo su www.netflix.com dopo che l'utente ha concesso il permesso.
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

Dalla sezione *Importa* del pannello. L'utente apre netflix.com/browse/my-list; il pannello legge, solo su sua richiesta e solo in quella scheda, il nome e l'id delle copertine presenti nella pagina (`chrome.scripting.executeScript`, permesso netflix.com già concesso). L'id viene dal link della copertina oppure da `data-ui-tracking-context`. Dalla 0.6.4 il pulsante "Scorri e leggi tutta la lista" fa scorrere la pagina fino in fondo, come farebbe l'utente, così Netflix carica tutte le copertine; poi la riporta in cima. Nessuna richiesta a Netflix e nessuna API interna. I titoli vanno a `POST /api/extension/import-list` a gruppi di 10: ognuno è riconosciuto dall'id Netflix già noto, poi per nome (preferendo quello disponibile su Netflix) e finisce in wishlist, se non è già in wishlist o in libreria. Il pannello mostra quanti sono stati aggiunti e quali non sono stati trovati nel catalogo.

L'import dall'export completo dei dati di Netflix (lo .zip con `MyList.csv`) è stato tolto nella 0.6.4, su richiesta di Riccardo: quell'archivio contiene molti più dati personali del necessario.

### Storico visioni di Netflix (dalla 0.6.2)

Dal pannello, *Importa* > "Carica lo storico" apre `import.html?mode=history`. Si carica:

- `NetflixViewingHistory.csv`: Account > profilo > Attività di visione > "Scarica tutto" (subito, solo il profilo scelto, colonne `Title,Date`);
- dalla 0.6.4 non si carica più lo .zip di "Scarica le tue informazioni personali": la pagina lo rifiuta. Va ancora bene `ViewingActivity.csv` estratto a mano, con tutti i profili (si sceglie quale importare).

Il file è letto nel browser e **non arriva al server**: `netflix-export.js` scarta trailer, anteprime e visioni sotto i due minuti, poi raggruppa le righe. "Serie: Stagione 4: Episodio" diventa una serie con la stagione più alta vista; una riga senza ":" è un film; "Nome: sottotitolo" è ambiguo e il server prova prima il titolo intero (film) poi "Nome" (serie). A `POST /api/extension/import-history` partono solo nome, tipo, stagione e la riga d'esempio, a gruppi di 20 (10 dalla 0.6.4).

Il server (`src/server/services/import-history.ts`) aggiunge solo ciò che manca dalla libreria: un film come visto, una serie come vista fino a quella stagione (`seenThrough`, così una stagione successiva compare in "Novità"). Ciò che è già in libreria non cambia; un titolo aggiunto esce dalla wishlist. Non crea eventi di visione, quindi le statistiche dei minuti non cambiano. I titoli non collegati al catalogo sono elencati nella pagina e scaricabili come `cineloop-import-errori.txt`, con la riga originale di Netflix accanto.

Dalla 0.6.4 i gruppi sono da 10 e la richiesta porta `partial: true`. Il server smette di cercare dopo circa 25 secondi e rimanda indietro come `pending` i titoli che non ha guardato; l'estensione li rimette in testa alla coda. Le route di import hanno `maxDuration = 60`, perché le ricerche anime su ANN aspettano più di un secondo tra una richiesta e l'altra. Se CineLoop non risponde, un gruppo viene riprovato due volte. Se fallisce ancora finisce nel log come "non ha risposto" e l'import continua; dopo tre gruppi falliti di fila si ferma.

Dalla 0.6.5 la lettura dello storico è più tollerante. Il nome della serie ripetuto da Netflix viene tolto, e la stagione scritta in parole ("Libro primo") viene riconosciuta. Le righe senza nome (": Episodio 1") vengono saltate, e il server controlla le righe una per una, così una riga illeggibile non fa fallire il suo gruppo. Su TMDB, se nessun titolo ha il nome intero, si provano prima le parti iniziali più lunghe ("Gundam: Requiem for Vengeance" prima di "Gundam") e poi, per un film, ogni parte da sola ("Allegiant"). Valgono anche le stesse parole senza punteggiatura e un titolo che aggiunge solo un sottotitolo ("Il lato positivo - Silver Linings Playbook").

