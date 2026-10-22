# Architettura

## Livelli

```
src/app            Route (App Router). Pagine server, nessuna logica di business.
src/components     UI. ui/ primitive, layout/ shell, cartelle per funzionalità.
src/server
  auth/            Password (scrypt), sessioni su DB, utente corrente, accesso Google/Discord (oauth.ts).
  actions/         Server Action: validano l'input (zod), chiamano il repository, refresh().
  services/        Compongono i dati per le pagine (view model).
  data/            Interfaccia Repository + implementazioni memoria e PostgreSQL.
src/domain         Regole pure e tipi: confronto gusti, ruota, statistiche, classifiche.
src/integrations
  providers/       Adapter dei servizi di streaming (vedi providers.md).
  catalog/         CatalogService: catalogo demo o TMDB.
```

Le pagine chiamano i servizi, i servizi chiamano il repository e il dominio, e la UI riceve solo view model. Il dominio non conosce né database né React, quindi è testato in isolamento (`tests/unit`).

## Dati

`getRepository()` sceglie l'implementazione all'avvio:

- **senza `DATABASE_URL`**: `MemoryRepository`, popolato dal seed demo (`src/server/data/seed`). Zero configurazione. I dati vivono quanto il processo.
- **con `DATABASE_URL`**: `PostgresRepository` su Drizzle. Schema in `src/server/data/postgres/schema.ts`, migrazioni in `drizzle/`.

Le due implementazioni rispettano lo stesso contratto e la stessa semantica (wishlist con nuove voci in cima e posizioni contigue, amicizie simmetriche, revoca delle altre sessioni al cambio password).

Il catalogo segue lo stesso schema: i titoli vivono nella tabella `titles` (una cache) e un `CatalogService` la riempie. Con `TMDB_READ_TOKEN` la ricerca integra i risultati di TMDB e li salva in cache, così si possono aggiungere a liste e wishlist.

La ricerca trova anche attori e registi (`searchPeople`, TMDB `/search/person`): nella barra in alto compaiono nel gruppo "Attori e registi" e, quando la ricerca è il loro nome, i loro titoli più noti salgono in cima ai titoli. In Esplora la griglia mostra tutta la loro filmografia, dal titolo più noto. La pagina `/person/[id]` (`person`, TMDB `/person/{id}?append_to_response=combined_credits`) elenca film e serie in cui hanno recitato (non talk show né apparizioni come se stessi) o che hanno diretto, scritto o ideato. Con il catalogo demo non ci sono persone.

## Autenticazione

- Password con scrypt (`node:crypto`), salt per utente, confronto a tempo costante.
- Sessione: token casuale da 256 bit in un cookie `httpOnly`, `sameSite=lax`, `secure` in produzione. Il database salva solo lo SHA-256 del token.
- `proxy.ts` fa un controllo ottimistico del cookie per reindirizzare presto. Il controllo vero è `getCurrentUser()`, chiamato da ogni servizio e da ogni Server Action, che non si fidano mai di id passati dal client.
- Cambiare password disconnette tutte le altre sessioni.
- Ospiti: chi arriva senza sessione finisce su `/start` e sceglie solo un username. L'account viene creato subito con `email` e `password_hash` nulli (migrazione 0014) e una sessione di un anno; un banner fisso sotto la barra in alto ricorda di registrarsi. `/register`, aperto da un ospite, completa lo stesso account (`completeRegistration`) e tiene tutti i salvataggi.

## Preferenze che cambiano il comportamento

| Preferenza | Effetto |
|---|---|
| Visibilità profilo | `getFriendProfile` nasconde libreria e voti a chi non è autorizzato |
| Condividi attività | Chi la disattiva sparisce dai feed degli amici (`listSharedActivity`) |
| Notifiche per tipo | La campanella filtra i tipi disattivati (`filterNotifications`) |
| I tuoi servizi | "Da vedere stasera" dà priorità ai titoli disponibili lì |
| Riduci animazioni | Forza `reducedMotion` in Motion e azzera le transizioni CSS |

## Rendering

Next.js 16 con `cacheComponents` e `partialPrefetching`: la shell di ogni pagina è prerenderizzata, mentre i dati per utente sono in streaming dentro `<Suspense>` con skeleton dedicati. Ogni dato letto a richiesta (cookie, sessione, `usePathname`) sta dentro un confine Suspense.

## Animazioni

Motion con `MotionConfig reducedMotion="user"` più la preferenza in-app. La ruota della serata ha fisica propria (carica, rotazione lunga con decelerazione, rimbalzo smorzato, scatto del puntatore a ogni settore). Con meno movimento salta direttamente al risultato.

## Test

- `npm test`: Vitest per dominio, auth, repository, adapter, catalogo e controlli UI (jsdom).
- `npm run test:e2e`: Playwright su build di produzione con dati demo. Copre accesso e uscita, navigazione, ricerca, wishlist con annulla, serata insieme e controlli axe su ogni pagina (desktop e mobile).

## Serate insieme e playlist

- **Playlist** (migrazione `0011_playlists`): liste con nome dentro la Wishlist (scheda "Playlist"), `playlists` + `playlist_items`. Visibilità `private` (solo il proprietario), `friends` (gli amici possono caricarla in una serata) o `collaborative` (in più, gli amici aggiungono e tolgono titoli: l'azione `setInPlaylist` controlla amicizia e visibilità, e la copertina ha un badge tondo). Solo il proprietario rinomina, cambia visibilità ed elimina; `listSharedPlaylists` restituisce soltanto quelle condivise e il servizio le chiede solo per gli amici confermati.
- **Serata** (`/watch-party`): ogni partecipante porta la propria wishlist o una o più playlist (`PartySource`, `wantedFrom`); le liste scelte si uniscono, si filtra per categoria (tutto/film/serie/anime) e, a scelta, per "voluto da almeno metà del gruppo". L'elenco mostra tutti i titoli compatibili. Il vincitore è sorteggiato tra tutti; la ruota mostra al massimo 20 spicchi (il vincitore più un campione degli altri, `wheelSample`), quindi le probabilità non cambiano.
- Il filtro salvato con la serata è `common` solo con "tutto"; altrimenti è la categoria.

## Classifiche, podio ed Esplora

- **Podio per categoria** (migrazione `0012_podiums`): `preferences.podiums` = `{movie|series|anime: [id×3]}`; `buildPodiums` (`src/domain/podium.ts`) ricava picks e candidati e porta nella categoria giusta un vecchio podio unico (`preferences.podium`). Nel profilo di un amico (`/friends/[username]`) è mostrato in sola lettura, solo se il suo profilo è visibile.
- **Esplora**: le righe di uscite (`getReleasesView`, calendari AniList e ricerche ANN) sono in una `<Suspense>` a parte, così catalogo e consigli compaiono subito; le ricerche della scheda principale delle nuove stagioni girano in parallelo con un budget di 6 s.
- **Dove lo guardi**: `saveManualProgress` accetta un `providerId` (solo servizi del catalogo del titolo, mai Anime Unity / Streaming Community); il pulsante "Continua a guardare" della scheda usa `resolveContinueUrl` come la Home.

## Database su Supabase (fino al 1 novembre, al posto di Neon)
`DATABASE_URL` può puntare a Supabase: usa la stringa "Session pooler" (porta 5432) o "Transaction pooler" (6543); `src/server/data/postgres/connection.ts` imposta `prepare: false` (richiesto dal pooler) e SSL su host `*.supabase.com`. Il build applica da solo migrazioni e catalogo di base (`npm run db:migrate && npm run db:seed` a mano). Account e librerie non si copiano da soli: partono vuoti. Limiti Free: 500 MB, 5 GB di uscita.
