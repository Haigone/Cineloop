# Estensione browser

Stato: **disponibile per Netflix** (Chrome, Edge, Brave e altri browser Chromium). Il codice è in `extension/`; `npm run build` lo impacchetta in `public/cineloop-extension.zip`, che il sito offre in Impostazioni > Estensione Netflix.

## Cosa fa

- **Aggiorna CineLoop mentre guardi.** Il titolo passa a "In corso" con il link per riprendere su Netflix, sparisce dalla wishlist e il tempo di visione entra nelle statistiche.
- **Ti mostra agli amici.** Nella loro dashboard compari in "I tuoi amici stanno guardando" con il pulsante **Unisciti**.
- **Guardare insieme.** Chi si unisce apre lo stesso titolo dal proprio account Netflix. Per avere play, pausa e posizione allineati si usa un'estensione watch party già esistente (per esempio Teleparty): chi ospita crea la stanza e incolla il link nel pannello di CineLoop; gli amici lo trovano nel pulsante "Entra nella stanza". CineLoop non controlla il player, quindi non ne reimplementa la sincronizzazione.

## Cosa legge

Per la scheda Netflix in cui stai guardando, e solo quella:

- l'indirizzo della pagina (es. `https://www.netflix.com/watch/80077368`);
- il titolo della scheda (spesso è solo "Netflix");
- se la scheda sta riproducendo audio (dopo 10 minuti di silenzio l'estensione smette di segnalarti);
- **cosa è in riproduzione, come lo nomina il player** (dalla versione 0.2.0, 8 ottobre 2026, su richiesta del proprietario del progetto): il nome della serie o del film e la riga "S4:E5". `player-title.js` legge solo due cose sulle pagine `/watch`: i metadati multimediali che la pagina passa al browser (gli stessi dei controlli multimediali del browser) e la riga del titolo del player (`[data-uia="video-title"]`). Così serie, stagione ed episodio si riconoscono senza chiedere nulla.

Dall'indirizzo delle pagine di catalogo (`?jbv=` o `/title/`) ricorda l'id della serie da cui sei partito, così riconosce le puntate successive anche senza il nome dal player.

## Cosa non legge, mai

- Cookie, localStorage, token, header o richieste di rete.
- Il resto della pagina: elenchi, "La mia lista", cronologia, profilo, il flusso video o i sottotitoli. Lo script non modifica la pagina, non comanda il player e non fa richieste; gira solo su www.netflix.com dopo che l'utente ha concesso il permesso.
- Qualsiasi altro sito. L'unico permesso host possibile è `https://www.netflix.com/*`, opzionale, richiesto dal pannello con un clic dell'utente.

Non fa alcuna richiesta a Netflix: parla solo con il server CineLoop scelto dall'utente.

## Come funziona

1. In Impostazioni l'utente genera un **codice monouso** (8 caratteri, valido 10 minuti, salvato solo come hash).
2. Nel pannello dell'estensione inserisce l'indirizzo del sito e il codice. `POST /api/extension/pair` restituisce un **token del dispositivo**, casuale e revocabile da Impostazioni (anche questo salvato solo come hash). Le credenziali Netflix non sono mai coinvolte.
3. Con una scheda `/watch/{id}` aperta, il service worker invia ogni minuto una `SyncObservation` a `POST /api/extension/observe`:

```ts
interface SyncObservation {
  providerId: ProviderId;
  url: string;
  documentTitle: string;
  hints?: { title?: string; season?: number; episode?: number; parentId?: string };
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

Finché l'estensione non è sul Chrome Web Store:

1. Impostazioni > Estensione Netflix > scarica `cineloop-extension.zip` e decomprimilo.
2. Apri `chrome://extensions`, attiva "Modalità sviluppatore", scegli "Carica estensione non pacchettizzata" e seleziona la cartella `cineloop-extension`.
3. Apri l'estensione, inserisci indirizzo e codice, poi "Consenti su netflix.com".

Per aggiornarla basta sostituire la cartella e premere "Ricarica" in `chrome://extensions`.

## Test

`tests/e2e/extension.spec.ts` carica l'estensione vera in Chromium, la collega, simula le pagine di netflix.com (nessuna richiesta esce verso Netflix), conferma un titolo, verifica che la puntata successiva sia riconosciuta e che un amico possa unirsi. La logica pura è in `tests/unit/presence.test.ts`, il servizio in `tests/unit/sync.test.ts`.
