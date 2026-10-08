# CineLoop

Il tuo hub personale e sociale per film, serie e anime. Tieni traccia di cosa guardi, scopri cosa vedere stasera, confronta i gusti con gli amici e lascia che la ruota scelga il film della serata.

CineLoop **non è una piattaforma di streaming**: non riproduce contenuti e non accede ai tuoi account. Ti riporta al servizio dove stai guardando.

## Avvio rapido

```bash
npm install
npm run dev
```

Apri http://localhost:3000 e premi **Entra con l'account demo** (oppure `marco@cineloop.dev` / `cineloop-demo`).

Senza configurazione l'app usa dati demo in memoria: libreria, amici, attività e statistiche sono generati rispetto a oggi, quindi "questa settimana" ha sempre dati.

## Con PostgreSQL

```bash
cp .env.example .env.local      # imposta DATABASE_URL
npm run db:migrate              # applica le migrazioni in ./drizzle
npm run db:seed                 # catalogo + persone demo (--reset per ripartire da zero)
npm run dev
```

Con `DATABASE_URL` impostato l'app usa PostgreSQL. Anche `npm run build` applica le migrazioni, quindi un deploy (es. Vercel con Neon) crea da solo le tabelle: basta impostare `DATABASE_URL`. In questa modalità il pulsante dell'account demo non compare: accedi con le credenziali sopra.

## Catalogo TMDB (opzionale)

Imposta `TMDB_READ_TOKEN` (token di lettura API v3 di [TMDB](https://www.themoviedb.org/settings/api)). La ricerca integra i titoli di TMDB e li salva in cache. Quando è attivo, l'app mostra l'attribuzione richiesta da TMDB.

## Script

| Comando | Cosa fa |
|---|---|
| `npm run dev` | Server di sviluppo |
| `npm run build` / `npm start` | Build e avvio in produzione |
| `npm run lint` / `npm run typecheck` | ESLint e TypeScript strict |
| `npm test` | Test unitari e di componente (Vitest) |
| `npm run test:e2e` | Test end-to-end e accessibilità (Playwright + axe) |
| `npm run db:generate` | Genera una migrazione dallo schema Drizzle |
| `npm run db:migrate` / `npm run db:seed` | Migrazioni e dati demo |

Per i test E2E con un Chromium già installato: `PLAYWRIGHT_CHROMIUM_PATH=/percorso/chrome npm run test:e2e`.

## Sezioni

- **Home**: ora in visione, continua a guardare, cosa fanno gli amici, la tua settimana, da vedere stasera.
- **Libreria**: tutto quello che hai visto o stai seguendo, con filtri, voti a mezze stelle e stato.
- **Wishlist**: la tua coda in ordine di priorità, riordinabile anche da tastiera.
- **Classifiche**: i tuoi preferiti per tipo e cosa mette d'accordo gli amici.
- **Amici**: attività, compatibilità dei gusti, titoli in comune.
- **Serate insieme**: scegli chi c'è, CineLoop trova i titoli compatibili, la ruota decide.
- **Profilo e Impostazioni**: statistiche, privacy, notifiche, servizi che usi, riduzione delle animazioni.

## Stack

Next.js 16 (App Router), React 19, TypeScript strict, Tailwind CSS 4, Motion, PostgreSQL con Drizzle, zod, Vitest, Playwright con axe. Nessuna libreria di componenti UI.

## Documentazione

- [Architettura](docs/architecture.md)
- [Integrazioni con i provider](docs/providers.md): cosa è consentito per Netflix, gli altri servizi, Anime Unity e Streaming Community
- [Estensione browser](docs/browser-extension.md): progetto, non ancora implementata

## Limiti noti

- Nessun provider sincronizza automaticamente: "Continua su…" apre il servizio, ma l'avanzamento nelle serie viene per ora dai dati demo.
- Anime Unity e Streaming Community non sono supportati per scelta (vedi docs/providers.md).
- Il tema è solo scuro.
