# CineLoop: contesto per i thread

Leggi questo file all'inizio di ogni lavoro; a fine lavoro aggiungi poche righe (decisione nuova, file chiave, migrazione). Dettagli tecnici: [architecture.md](./architecture.md), [providers.md](./providers.md), [browser-extension.md](./browser-extension.md). Ultimo aggiornamento: 2026-10-21. Elenco difetti noti e priorità: [difetti.md](./difetti.md).

## Cos'è
Hub personale e sociale per film, serie e anime (NON una piattaforma di streaming). Repo `haigone/cineloop`, branch `main`, produzione su Vercel + Neon (Frankfurt), deploy da `main`. Il proprietario, Riccardo (GitHub Haigone), scrive in italiano: rispondi sempre in italiano. Il catalogo e i consigli sono "la parte fondamentale del sito".

## Regole di Riccardo (non negoziabili)
- Merge automatico (16/10, "Allow auto-merge per tutto"): i thread uniscono da soli le proprie PR a CI verde. Eccezioni: PR messe in attesa da lui (SEO, PR #66, finché non ha il dominio) e rimozioni di funzioni. L'impostazione GitHub "Allow auto-merge" del repo la attiva lui.
- Mai rimuovere funzioni, pulsanti o codice esistenti senza chiederglielo prima (detto l'11/10 dopo il pulsante "Guarda in streaming"). Rifiutare di estendere è lecito, rimuovere no. Se una modifica può cambiare cosa fa un pulsante visibile, dillo prima.
- "Pusha" = push e merge in `main` (deploy in produzione) a CI verde. Se ambiguo, chiedi in una riga.
- Nulla di pubblicato, inviato o a pagamento (marketing, social) senza il suo ok.
- Un thread per obiettivo, brevi; niente subagenti se non richiesti; una sola build/test completa prima della PR (vedi istruzioni del progetto).

## Comandi
- `npm run dev`; `npm run typecheck`; `npm run lint`; `npm test` (Vitest); `npm run test:e2e` (Playwright + axe; nei container cloud `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`).
- Senza `DATABASE_URL`: repository in memoria con dati demo (login `marco@cineloop.dev` / `cineloop-demo`). Con `DATABASE_URL`: Postgres, `npm run db:migrate && npm run db:seed`.
- `npm run build` impacchetta l'estensione, esegue le migrazioni e carica il catalogo base. Prossima migrazione: **0022** (0020 = link episodi, 0021 = consenso provider).
- `npm run typecheck` genera da solo i tipi delle route (`next typegen`). Dal 21/10 le PR hanno CI (`.github/workflows/ci.yml`: lint, build, typecheck, unit, E2E Chromium). Tutti i test E2E girano in CI.
- Next.js 16.4 ha API diverse da quelle note: leggi `node_modules/next/dist/docs/` prima di scrivere codice (vedi AGENTS.md).
- Stack: Next 16.4 (cacheComponents, partialPrefetching, `proxy.ts`), React 19, Tailwind 4, Motion, Drizzle + PostgreSQL, zod. Dati reali del catalogo richiedono `TMDB_READ_TOKEN` (già su Vercel).

## Aree e chi ci lavora
Titoli dei thread con prefisso dell'area. Il lavoro sull'estensione va sempre al team Estensione.
- **Estensione** (`extension/`): rilevamento, import, guarda insieme, provider.
- **Sito/frontend** (`src/app`, `src/components`).
- **Backend/dati/auth** (`src/server`, `src/domain`, `drizzle/`).
- **Marketing e crescita** (+ SEO), **Social**, **Grafica e video**: file in `/mnt/project-files/marketing/`, skill `cineloop-marketing`, `cineloop-seo`, `cineloop-social`, `cineloop-grafica-video`.

## Estensione (0.6.8 in main)
- Chromium + Firefox 140+ (stesso codice, `scripts/pack-extension.ts` cambia il manifest; `compat.js` mappa chrome→browser). Firefox permanente richiede la firma AMO con l'account di Riccardo; non provato su Firefox reale.
- Dalla 0.6.8 (PR #56, 16/10) Prime Video, Anime Unity e Streaming Community sono attivi dall'installazione, con avviso sul sito; poi il consenso dei provider è stato semplificato (PR #79, `provider_consent`, migrazione 0021) e i host VixCloud seguono Streaming Community. Cambio di politica rispetto al 15/10 deciso da Riccardo: per i dettagli e i limiti vedi docs/providers.md prima di toccare i permessi.
- Popup: Sto guardando, Guarda insieme, Importa. La Watchlist è stata tolta su sua richiesta.
- Import: "La mia lista" di Netflix (lettura della scheda aperta, con scorrimento automatico confermato) e CSV cronologia (`import.html?mode=history`, letto nel browser, mai salvato). Non si accetta più lo zip completo. Serie importate = viste fino all'ultima stagione (Novità), film completati; limiti di tempo in PR #54. Dal 16/10 (ext 0.6.6-0.6.7, PR #71, #73) l'import registra i giorni di visione, una visione per episodio con la sua durata.
- Guarda insieme: Netflix via player interno (`netflix-player.js`, solo in una stanza, decisione 14/10 "imita al 100% Teleparty", senza copiare codice Teleparty); Prime con `<video>`. `SYNCED_PROVIDERS` = netflix + prime-video. AU/SC mai sincronizzati.
- Prime Video: nessuna API pubblica (nemmeno Paramount+). Selettori non verificati su Prime reale. Paramount+ non è ancora un provider.
- Avviso "Estensione non rilevata": mostrato se l'account non ha dispositivi collegati (`listExtensionDevices`); `ScrollToHash` per i link con # su pagine in streaming.

## Politica provider (aggiornare docs/providers.md prima di aggiungere capacità)
- Vietati: scraping, aggirare DRM o autenticazione, intercettare token, automazioni contro i ToS. Nulla è `available` senza un percorso di sincronizzazione legittimo e verificato (c'è un test).
- Netflix: nessuna API pubblica; stato `planned`; il server non chiama mai Netflix. Classifiche: Top 10 Italia dal TSV pubblico di Tudum.
- Rifiutati: rilevamento/dominio automatico di Streaming Community, deploy dell'estensione 0.5.0 con AU/SC, AnimeUnity come fonte dati, export di Netflix tramite pagine interne.
- Esistono: pulsante manuale "Dove sei arrivato" (stagione/episodio/minuto) e il pulsante "Guarda in streaming" di Riccardo (NON toccare).
- Marketing: mai promuovere AU/SC, mai nominare siti pirata, Netflix/Prime solo come "funziona con"; attribuzione TMDB.

## Funzioni e decisioni di prodotto
- **Home**: "Da vedere stasera" = wishlist in ordine di priorità (riordinabile) poi idee degli amici; hero = titolo live dall'estensione o ultimo aperto; sezioni `/home?c=film|serie|anime` (ricordata in `preferences.home_category`), sfondi per sezione. Episodi sempre come S4E4. Nessun "Da vedere" in libreria: i piani sono la wishlist.
- **Onboarding**: nuovi account su `/welcome` con 20 serie Netflix fisse (`src/domain/onboarding.ts`), mai film. Ospiti: `/start` con solo username, `email` può essere null (`isGuest`), banner fisso, sessione di un anno, `/register` completa lo stesso account. Login Google/Discord (OAuth + PKCE fatto a mano, `oauth_accounts`, bottoni solo se le variabili ci sono; gli utenti possono non avere password). Riccardo deve creare le app OAuth e impostare le variabili su Vercel.
- **Novità**: serie finite con una stagione nuova oltre `seenThrough`; la X offre "Avvisami il giorno dell'uscita" o "Nessun aggiornamento" (`library_entries.updates`).
- **Wrapped** di fine anno (`/wrapped`, PR #67, #70, #72): ricavato dalla libreria e dallo storico Netflix importato (ore stimate, tasto Aggiorna). Ore reali (2026-10-22): gli eventi dell'estensione sono blocchi da ~10 min, quindi Wrapped li raggruppa per episodio/film e giorno (1 visione, tetto = durata del titolo) e non somma l'import Netflix sopra il visto misurato; l'heartbeat non conta il tempo con il player in pausa (posizione ferma).
- **Podio** per categoria a mano (`preferences.podiums`), visibile in sola lettura agli amici.
- **Anime**: ANN (API ufficiale) + Filler List (pagina pubblica in cache), ordine di visione modificabile solo con il titolo in libreria; id `anime-ann-<id>`; AniDB non collegato; MAL stagionali via Jikan. Se gli anime sembrano sbagliati, controlla prima i parser (`/api/diagnostics/sources`). Esplora usa ancora TMDB per scaffali e discover.
- **Saghe film** da collezioni TMDB (`tmdb-collection-<id>`), ordine modificabile anche senza libreria, "Saghe da completare" in Home Film.
- **Duplicati**: `src/domain/duplicates.ts` (`REPLACED_TITLES`, `FIRST_FOR`); per bloccarne uno nuovo basta aggiungere una voce, senza migrazione. Caso JoJo.
- **Community**: pubblicare una playlist è un flag separato dalla visibilità; "salva" è un segnalibro, non una copia; "Aggiungi alla wishlist" salta titoli già in wishlist o libreria.
- **Serate insieme** (`shared_watches`, `watch_parties`): ogni percorso che salva il progresso deve chiamare `shareProgress()` (`src/server/services/shared-watch.ts`). Si aggiungono amici direttamente (accetta/rifiuta rimandato). `/watch-party` è una procedura a passi; cornice viola `--color-violet` per le schede condivise. Il servizio della serata è quello dell'host.
- **Esplora**: filtro "Su" via TMDB watch providers (IT), nuove stagioni con conto alla rovescia, uscite in `<Suspense>` separata.
- **Interfaccia**: nessuna animazione senza rispetto di "Riduci animazioni"; ogni dato per utente dentro `<Suspense>`.

## Cose da non toccare / attenzione
- Pulsante "Guarda in streaming" e codice AU/SC esistente: non rimuovere.
- Vercel limita i deploy (~1 ogni 15 minuti): distanzia i push.
- ANN, Filler List, Tudum e Netflix/Prime non sono raggiungibili dal sandbox: selettori e parser testati solo su fixture.
- Il test E2E dell'estensione (Netflix) falliva al controllo di pausa per un difetto del test, non dell'estensione: `party-sync.js` ignora i `<video>` senza durata finita (come quelli veri di Netflix) e lo stub era un flusso live. Ora lo stub riproduce un WAV muto. Un nuovo stub di player deve avere una durata finita.

- Test E2E dell'estensione "instabili" (21/10): non era instabilità. In 0.7.5 `popup.js` cercava `grant-btn` e `grant-skip`, tolti dall'HTML: il `null` bloccava lo script e il popup restava vuoto per tutti. Corretto in 0.7.6 (PR separata), qui aggiunto un test unit che confronta gli `$("id")` di popup.js con popup.html. `actionTimeout` 15s in Playwright: un elemento mancante fallisce subito invece di attendere il timeout del test. I test con estensione spostano le `optional_host_permissions` in `host_permissions` nella copia di prova.
- Estensione 0.7.1: ogni pausa/seek/cambio episodio manda subito un'osservazione, quindi `/api/extension/observe` ha un bucket di limite proprio (60/min). I test E2E dell'estensione condividono lo store demo: Luca (seed Netflix) diventa Prime dopo `extension-prime.spec`, quindi `extension.spec` lo rimette su Netflix con un `observe`. Nei test con estensione `launchPersistentContext` usa `channel: "chromium"` (senza `PLAYWRIGHT_CHROMIUM_PATH`): l'headless shell predefinito di Playwright non carica le estensioni e il test va in timeout (era la causa su GitHub Actions).

- Controllo mobile (22/10): `tests/e2e/mobile-layout.spec.ts` (Pixel 7) verifica che nessuna pagina principale scorra in orizzontale; aggiungi qui le nuove rotte. Tutte passano.

## File chiave
- `src/proxy.ts`: reindirizza le pagine private a `/start`; controllo ottimistico del cookie.
- `src/server/data/postgres/schema.ts`, `drizzle/`: schema e migrazioni (ultima 0019).
- `src/server/auth/oauth.ts`: accesso Google/Discord.
- `src/server/services/shared-watch.ts`, `nights.ts`: Serate insieme.
- `src/domain/duplicates.ts`: blocco dei titoli doppi.
- `src/domain/party.ts`: orologio della stanza guarda-insieme.
- `src/integrations/providers/`: adapter dei servizi; `src/integrations/catalog/`: catalogo TMDB/demo.
- `src/integrations/anime/`: ANN, Filler List, `AnimeFirstCatalog`.
- `extension/background.js`, `popup.js`, `netflix.js`, `party-sync.js`, `prime-page.js` (se presente), `netflix-player.js`: logica dell'estensione.
- `extension/import.html`, `netflix-export.js`: import lista e cronologia.
- `scripts/pack-extension.ts`, `db-prepare.ts`: build dell'estensione e preparazione dati.
- `src/components/settings/scroll-to-hash.tsx`: scroll verso ancore in pagine in streaming.
- `tests/unit`, `tests/e2e`: test.
- `/mnt/project-files/marketing/campagne.md`, `team-social-grafica.md`: piano e registro marketing; `guide/`, `screenshots/`: guide e immagini da riusare.

- Consumo Neon (22/10): la causa era `listTitles()` (tutta la tabella `titles`) a ogni vista di Home/Amici/Classifiche/Serate. Ora ha cache in memoria di 5 min (azzerata su `upsertTitles`/`replaceTitle`); per cercare o verificare pochi id usa `getTitlesByIds` / `findTitlesBySearchKey`, mai `listTitles`. Diagnosi e stime: `/mnt/project-files/economia/consumi.md`.

- Supabase (22/10): Neon sospeso per quota Network Transfer; per i test fino al 1/11 `DATABASE_URL` può puntare a Supabase (pooler, vedi docs/architecture.md). Nulla cancellato su Neon. Il DB nuovo parte vuoto: solo catalogo.
