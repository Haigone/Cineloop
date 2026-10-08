# Integrazioni con i provider

CineLoop non riproduce contenuti, non usa le credenziali dell'utente presso i provider e non aggira protezioni. Questo documento riassume cosa è stato verificato per ogni servizio, cosa è stato deciso e cosa resta da fare. Ultima verifica: ottobre 2026.

## Riepilogo

| Servizio | Stato in CineLoop | Cosa fa oggi | Percorso legittimo |
|---|---|---|---|
| Netflix | In valutazione | Link "Continua su Netflix" (`/watch/{id}` o homepage) | Import del CSV "Attività di visione" esportato dall'utente; rilevamento via estensione da rivalutare |
| Prime Video, Disney+, Apple TV+, NOW, Crunchyroll | In arrivo | Link alla homepage del servizio | Da studiare caso per caso (API ufficiali, export dei dati, partnership) |
| Anime Unity | Non supportato | Nulla: adapter stub | Nessuno |
| Streaming Community | Non supportato | Nulla: adapter stub | Nessuno |

Nessun provider è segnato `available`, e un test (`tests/unit/providers.test.ts`) lo verifica: lo stato cambia solo quando esiste un canale di sincronizzazione verificato.

## Netflix

**Fatti verificati**

- Netflix non offre un'API pubblica. Il programma per sviluppatori è stato chiuso nel novembre 2014 ([TechCrunch](https://techcrunch.com/2014/06/13/netflix-api-shutdown)). CineLoop non presume né inventa endpoint di playback.
- I [Termini di utilizzo](https://help.netflix.com/en/legal/termsofuse), sezione 1.8, vietano di "use any robot, spider, scraper or other automated means to access the Netflix service" (iv) e di aggirare o alterare le protezioni dei contenuti (iii).
- L'utente può scaricare la propria cronologia: Account > Profili > Attività di visione > "Scarica tutto", che produce un CSV ([Centro assistenza Netflix](https://help.netflix.com/en/node/101917)).

**Decisioni**

- Il rilevamento automatico è **disattivato** (`NetflixAdapter.capabilities.detectCurrentContent = false`).
- È consentito solo il link di ritorno: un URL `https://www.netflix.com/watch/{id}` apre il titolo nell'account dell'utente, su Netflix. È un link, non un accesso automatico.
- Il parser degli URL `/watch/{id}` esiste ed è testato, ma resta spento finché l'approccio dell'estensione (vedi [browser-extension.md](./browser-extension.md)) non viene valutato rispetto ai termini. Un'estensione che legge solo URL e titolo della scheda aperta dall'utente non è un robot che accede al servizio, ma la valutazione va fatta prima di attivarla, non dopo.

**Prossimo passo consigliato**: import del CSV di Netflix. L'utente carica il proprio file, CineLoop abbina i titoli al catalogo e crea gli eventi di visione. È il percorso più sicuro: dati dell'utente, forniti dall'utente, nel formato offerto da Netflix.

## Prime Video, Disney+, Apple TV+, NOW, Crunchyroll

Servizi con licenza. Nessuna integrazione costruita: l'adapter `HomepageAdapter` porta solo alla homepage ufficiale, così "Continua su…" funziona senza pretendere di sapere a che punto è l'utente. Prima di implementare qualsiasi rilevamento serve la stessa verifica fatta per Netflix (API ufficiali, termini, export dei dati).

Nelle impostazioni l'utente può indicare i servizi che usa ("I tuoi servizi"). È una lista compilata a mano: non collega account e non sincronizza nulla. Serve solo a dare priorità, in "Da vedere stasera", ai titoli disponibili sui suoi servizi.

## Anime Unity e Streaming Community

**Fatti verificati**

- Streaming Community è descritto dalla stampa italiana come sito pirata, oscurato a ripetizione. La Guardia di Finanza reindirizza i visitatori a una pagina di avviso e ha annunciato sanzioni agli utenti ([Sky TG24, maggio 2025](https://tg24.sky.it/tecnologia/2025/05/20/streaming-community-lotta-pirateria); [Punto Informatico](https://www.punto-informatico.it/oscurata-principale-community-streaming-illegale-italia-utenti-rischio-multa/)).
- Per Anime Unity non ho trovato fonti autorevoli su provvedimenti specifici. Non risultano però licenze dai detentori dei diritti, un'API pubblica o termini che consentano l'accesso di terze parti, e il dominio cambia spesso. Gli stessi titoli sono distribuiti legalmente da Crunchyroll, Netflix e Prime Video.

**Decisione**: integrazione **non consentita**. Entrambi gli adapter (`AnimeUnityAdapter`, `StreamingCommunityAdapter`) sono stub documentati: nessun rilevamento, nessun link e nessuna homepage memorizzata. Lo stato è `not-supported` e nelle impostazioni non si possono segnare come servizi usati. I titoli restano tracciabili a mano, come qualsiasi altro.

## Cosa CineLoop non farà, per nessun provider

- Bypass DRM o di qualsiasi protezione dei contenuti.
- Uso, raccolta o intercettazione di credenziali, cookie o token di sessione.
- Scraping delle pagine del provider o chiamate a endpoint non documentati.
- Automazioni che i termini del servizio vietano.
- Accesso a dati privati senza un'azione esplicita dell'utente.

## Come aggiungere un provider

1. Aggiungi l'id a `ProviderId` (`src/domain/types.ts`) e la scheda in `PROVIDERS` (`src/domain/providers.ts`), con stato `planned`.
2. Registra un adapter in `src/integrations/providers/registry.ts`. Parti da `HomepageAdapter`, oppure da `DisabledAdapter` se non c'è un dominio ufficiale.
3. Documenta qui la verifica (API, termini, export dei dati) prima di attivare qualsiasi capacità.
4. Cambia lo stato in `available` solo quando la sincronizzazione legittima funziona ed è coperta da test.
