# Architettura

## Livelli

```
src/app            Route (App Router). Pagine server, nessuna logica di business.
src/components     UI. ui/ primitive, layout/ shell, cartelle per funzionalità.
src/server
  auth/            Password (scrypt), sessioni su DB, utente corrente.
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

## Autenticazione

- Password con scrypt (`node:crypto`), salt per utente, confronto a tempo costante.
- Sessione: token casuale da 256 bit in un cookie `httpOnly`, `sameSite=lax`, `secure` in produzione. Il database salva solo lo SHA-256 del token.
- `proxy.ts` fa un controllo ottimistico del cookie per reindirizzare presto. Il controllo vero è `getCurrentUser()`, chiamato da ogni servizio e da ogni Server Action, che non si fidano mai di id passati dal client.
- Cambiare password disconnette tutte le altre sessioni.

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
