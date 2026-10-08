# Integrazioni con i provider

CineLoop non riproduce contenuti, non usa le credenziali dell'utente presso i provider e non aggira protezioni. Questo documento riassume cosa è stato verificato per ogni servizio, cosa è stato deciso e cosa resta da fare. Ultima verifica: ottobre 2026.

## Riepilogo

| Servizio | Stato in CineLoop | Cosa fa oggi | Percorso legittimo |
|---|---|---|---|
| Netflix | Rilevamento tramite estensione | "Ora in visione", libreria e tempo aggiornati dall'estensione dell'utente; link "Continua su Netflix" | Estensione CineLoop (URL e titolo della scheda); in futuro anche l'import del CSV "Attività di visione" |
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

- Il rilevamento è **attivo tramite l'estensione CineLoop** (`NetflixAdapter.capabilities.detectCurrentContent = true`), deciso dal proprietario del progetto l'8 ottobre 2026. Dettagli in [browser-extension.md](./browser-extension.md).
- Perché è compatibile con i vincoli: l'estensione è installata e attivata dall'utente, legge solo indirizzo e titolo della scheda che l'utente sta già guardando (dati che il browser mostra nella sua interfaccia) e non fa richieste a Netflix. Non è un robot o uno scraper che accede al servizio al posto dell'utente, non legge pagine o player, non usa cookie né token, non aggira protezioni.
- Netflix non viene mai chiamato dal server. Il titolo si ricava da abbinamenti confermati dagli utenti o dal titolo della scheda; se non basta, chiede all'utente.
- Guardare insieme: CineLoop porta gli amici sullo stesso titolo e condivide il link di una stanza creata con un'estensione watch party esistente. Non controlla il player di Netflix.
- Lo stato del provider resta `planned`: non esiste un'integrazione ufficiale con Netflix e la sincronizzazione dipende da un'estensione che l'utente sceglie di installare.

- **Classifiche Netflix** (8 ottobre 2026). Ne mostriamo due, entrambe senza leggere le pagine di Netflix:
  - *Top 10 Netflix Italia*: il file di dati settimanale che Netflix pubblica per il download sul sito Top 10 di Tudum (`NETFLIX_TOP10_URL` in `src/integrations/netflix-top10.ts`). Il server lo scarica al massimo una volta al giorno, tiene solo le righe dell'Italia e salva il risultato nella tabella `charts`. Se il file non è raggiungibile o cambia formato, la sezione semplicemente non compare.
  - *Più visti su Netflix da chi usa CineLoop*: conteggio dei minuti registrati dall'estensione nella settimana, solo per chi condivide l'attività, senza nomi.
- **Non fatto, di proposito**: far leggere all'estensione il catalogo o la Top 10 dalle pagine di Netflix (anche "una volta al giorno, dal primo utente"). Sarebbe scraping del servizio con l'account di un utente, vietato dai termini (1.8) e dai vincoli del progetto. L'estensione resta limitata a indirizzo e titolo della scheda in cui l'utente sta guardando.

**Prossimo passo consigliato**: import del CSV di Netflix per lo storico precedente all'installazione dell'estensione.

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
