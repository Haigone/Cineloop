# Difetti noti del sito (21/10/2026)

Rilevati con una sola esecuzione di typecheck, lint, 100+ test unitari ed E2E (39 test) su `main` 681731d. Non ho potuto guardare produzione, Netflix/Prime reali né Firefox: i difetti sotto sono quelli visibili da codice e test. Stima: P = piccola (< 1 ora), M = media (mezza giornata), G = grande.

## Bloccanti
Nessun flusso principale (primo accesso, Home, libreria, Esplora, Wishlist, Community, Serate, impostazioni) è rotto nei test. Unico segnale serio:

- **Estensione: test E2E "pair the extension, watch on Netflix, and a friend joins" rosso, regressione dal 19/10.** Bisect: passa a `5b3ddfb`, fallisce da `f28a428` ("Fix progress tracking and episode auto-advance", estensione 0.7.1). Il test fallisce in modo non sempre identico (a volte non parte la pausa sincronizzata sulla stanza di Marco, a volte `#watching-meta` resta vuoto invece di "S2E4"), quindi può essere un problema di tempi dell'heartbeat Netflix o del popup. Non ho isolato la causa; richiede una prova su Netflix reale. File: `extension/background.js` (`frameProgress`, `tick`, `pickPlaying`), `extension/party-sync.js`, `tests/e2e/extension.spec.ts`. Stima: M. Non toccato (area Estensione, rischio di rompere guarda insieme).

## Medi
- **Il test E2E `progress.spec.ts` fallisce se eseguito dopo altri** (passa da solo): la hero della Home mostra "Dark" invece dell'ultimo titolo aperto, perché lo stato demo in memoria è condiviso tra test. Probabile difetto di isolamento del test, ma verificare che in produzione l'ultimo titolo aperto vinca davvero sulla hero. File: `src/components/home/hero.tsx`, `tests/e2e/progress.spec.ts`. Stima: P-M.
- **Nessuna CI sulle PR**: in `.github/workflows` ci sono solo bridge, APK TV e monitor del dominio. Typecheck, lint, unit ed E2E non girano mai in automatico, ed è così che la regressione sopra è passata (il merge "a CI verde" oggi si appoggia solo al deploy Vercel). Stima: M.

## Minori
- **Lint: 2 errori** "setState dentro un effect" in `src/components/title/rezero-version-chooser.tsx:24` e `watch-order.tsx:37` (funzionano, ma React 19 li segnala come render a cascata); 22 avvisi di variabili inutilizzate. Stima: P.
- **`npm run typecheck` fallisce su un clone pulito** (mancano i tipi generati `PageProps`, `LayoutProps`, `RouteContext`): serve prima un build o `next typegen`. Va scritto nei comandi o aggiunto allo script. Stima: P.
- **Due test E2E fragili** (selettori ambigui): corretti in questa PR (`community.spec.ts`: la select "Aggiungi dalla wishlist" contiene nel suo testo "Cerca nel catalogo"; `wishlist.spec.ts`: due toast "Sfondo di Film salvato" insieme).
- **Top 10 Netflix**: nel sandbox il fetch fallisce (rete bloccata), non un difetto del sito.
