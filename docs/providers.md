# Integrazioni con i provider

CineLoop non riproduce contenuti, non usa le credenziali dell'utente presso i provider e non aggira protezioni. Questo documento riassume cosa è stato verificato per ogni servizio, cosa è stato deciso e cosa resta da fare. Ultima verifica: ottobre 2026.

## Riepilogo

| Servizio | Stato in CineLoop | Cosa fa oggi | Percorso legittimo |
|---|---|---|---|
| Netflix | Rilevamento tramite estensione | "Ora in visione", libreria e tempo aggiornati dall'estensione dell'utente; link "Continua su Netflix" | Estensione CineLoop (URL e titolo della scheda); in futuro anche l'import del CSV "Attività di visione" |
| Prime Video, Disney+, Apple TV+, NOW, Crunchyroll | In arrivo | Link alla homepage del servizio | Da studiare caso per caso (API ufficiali, export dei dati, partnership) |
| Anime Unity | Disponibile tramite estensione CineLoop | Rileva titolo, episodio e frazione del video; salva il progresso e riapre la pagina al punto registrato | Permesso host opzionale, concesso dall'utente nel popup |
| Streaming Community | Rilevamento tramite estensione | Titolo, episodio e progresso quando leggibili; salva il link della pagina osservata | Permesso host opzionale per la directory e il dominio corrente, concessi dall’utente |

Anime Unity e Streaming Community sono segnati `available` per il rilevamento tramite estensione attivata esplicitamente dall'utente; il matching del titolo può comunque richiedere una conferma manuale se il nome non coincide con il catalogo.

## Netflix

**Fatti verificati**

- Netflix non offre un'API pubblica. Il programma per sviluppatori è stato chiuso nel novembre 2014 ([TechCrunch](https://techcrunch.com/2014/06/13/netflix-api-shutdown)). CineLoop non presume né inventa endpoint di playback.
- I [Termini di utilizzo](https://help.netflix.com/en/legal/termsofuse), sezione 1.8, vietano di "use any robot, spider, scraper or other automated means to access the Netflix service" (iv) e di aggirare o alterare le protezioni dei contenuti (iii).
- L'utente può scaricare la propria cronologia: Account > Profili > Attività di visione > "Scarica tutto", che produce un CSV ([Centro assistenza Netflix](https://help.netflix.com/en/node/101917)).

**Decisioni**

- Il rilevamento è **attivo tramite l'estensione CineLoop** (`NetflixAdapter.capabilities.detectCurrentContent = true`), deciso dal proprietario del progetto l'8 ottobre 2026. Dettagli in [browser-extension.md](./browser-extension.md).
- Perché è compatibile con i vincoli: l'estensione è installata e attivata dall'utente, legge solo indirizzo e titolo della scheda che l'utente sta già guardando e, dalla 0.2.0, il nome di ciò che è in riproduzione come lo mostra il player (serie, stagione, episodio), e non fa richieste a Netflix. Non è un robot o uno scraper che accede al servizio al posto dell'utente, non legge altro della pagina, non comanda il player, non usa cookie né token, non aggira protezioni.
- Netflix non viene mai chiamato dal server. Il titolo si ricava da abbinamenti confermati dagli utenti o dal titolo della scheda; se non basta, chiede all'utente.
- Guardare insieme: CineLoop porta gli amici sullo stesso titolo. Dalla 0.3.0 (8 ottobre 2026, richiesta del proprietario del progetto) l'estensione, solo mentre l'utente è in una stanza in cui è entrato, legge posizione e stato del video nella sua scheda e mette in play o in pausa il suo video quando un amico lo fa, come le estensioni watch party diffuse. Non sposta la posizione, non usa API interne del player, non tocca protezioni o flussi.
- Lo stato del provider resta `planned`: non esiste un'integrazione ufficiale con Netflix e la sincronizzazione dipende da un'estensione che l'utente sceglie di installare.

- **Classifiche Netflix** (8 ottobre 2026). Ne mostriamo due, entrambe senza leggere le pagine di Netflix:
  - *Top 10 Netflix Italia*: il file di dati settimanale che Netflix pubblica per il download sul sito Top 10 di Tudum (`NETFLIX_TOP10_URL` in `src/integrations/netflix-top10.ts`). Il server lo scarica al massimo una volta al giorno, tiene solo le righe dell'Italia e salva il risultato nella tabella `charts`. Se il file non è raggiungibile o cambia formato, la sezione semplicemente non compare.
  - *Più visti su Netflix da chi usa CineLoop*: conteggio dei minuti registrati dall'estensione nella settimana, solo per chi condivide l'attività, senza nomi.
- **Non fatto, di proposito**: far leggere all'estensione il catalogo o la Top 10 dalle pagine di Netflix (anche "una volta al giorno, dal primo utente"). Sarebbe scraping del servizio con l'account di un utente, vietato dai termini (1.8) e dai vincoli del progetto. L'estensione resta limitata a indirizzo e titolo della scheda in cui l'utente sta guardando.

- **Catalogo completo di Netflix** (8 ottobre 2026): Esplora > "Su: Netflix" (`/explore?on=netflix`). I dati vengono da TMDB (`/discover` con `with_watch_providers=8`, `watch_region=IT`, solo abbonamento), che a sua volta li prende da JustWatch. Nessuna richiesta a Netflix. Vale anche per Prime Video, Disney+, Apple TV+, NOW e Crunchyroll. Richiede `TMDB_READ_TOKEN`; senza, il filtro lavora sul catalogo di prova.

- **Non fatto, di proposito**: esportare "La mia lista" con l'estensione, anche con il consenso dell'utente. Richiederebbe di leggere pagine o chiamate interne di Netflix con la sessione dell'utente (accesso automatizzato, 1.8). L'alternativa legittima è l'export ufficiale dei dati personali di Netflix, da importare in CineLoop.

**Prossimo passo consigliato**: import del CSV di Netflix per lo storico precedente all'installazione dell'estensione.

## Prime Video, Disney+, Apple TV+, NOW, Crunchyroll

Servizi con licenza. Nessuna integrazione costruita: l'adapter `HomepageAdapter` porta solo alla homepage ufficiale, così "Continua su…" funziona senza pretendere di sapere a che punto è l'utente. Prima di implementare qualsiasi rilevamento serve la stessa verifica fatta per Netflix (API ufficiali, termini, export dei dati).

Nelle impostazioni l'utente può indicare i servizi che usa ("I tuoi servizi"). È una lista compilata a mano: non collega account e non sincronizza nulla. Serve solo a dare priorità, in "Da vedere stasera", ai titoli disponibili sui suoi servizi.

## Nuove stagioni e uscite

Da TMDB, aggiornati al massimo una volta al giorno: per le serie viste o in corso, `next_episode_to_air` e l'elenco delle stagioni dicono se ne è annunciata una nuova e quando esce; "In uscita" usa `/discover/movie` (data di uscita italiana da `/movie/{id}/release_dates`) e `/discover/tv` sui prossimi sei mesi. Il giorno dell'uscita CineLoop lascia una notifica a chi segue la serie o ha il titolo in wishlist. Nel catalogo di prova le date sono esempi.

## Anime Unity e Streaming Community

### Anime Unity

L'estensione CineLoop ha già un permesso host opzionale per `https://www.animeunity.so/*` e uno script dedicato alla pagina. Dopo che l'utente concede il permesso dal popup, il server riconosce le osservazioni Anime Unity e registra titolo, episodio e frazione del video quando disponibili.

- Le osservazioni sono accettate solo per pagine HTTPS del dominio `animeunity.so` (o suoi sottodomini) nel percorso `/anime/{id}`.
- Il progresso usa la frazione del video fornita dall'estensione; non si tenta di leggere player cross-origin o estrarre URL multimediali.
- La libreria salva l'URL della pagina osservata. Il comando "Continua" aggiunge un parametro temporaneo con la frazione salvata; lo script Anime Unity prova a riposizionare il video quando i metadati sono pronti e poi rimuove il parametro dall'URL.
- Le pagine anime di CineLoop includono un collegamento alla homepage di Anime Unity. Se è stato salvato un progresso, "Continua" preferisce la pagina esatta registrata.
- La sorgente dei metadati del catalogo resta TMDB/il catalogo locale configurato: l'attivazione del provider non rende il catalogo anime esaustivo né fa scraping del sito.

Il ripristino della posizione dipende dal fatto che il player consenta la ricerca temporale e che la pagina salvata apra lo stesso episodio. Se Anime Unity cambia la struttura del sito o il player non espone un elemento video accessibile, il ripristino può non funzionare.

### Streaming Community

L'estensione ha un permesso opzionale per `https://www.streaming-community.how/*`, la directory indicata dall'utente, e chiede separatamente il permesso per il dominio di riproduzione che trova sul pulsante “StreamingCommunity”. Il dominio viene risolto dinamicamente e messo in cache; quando cambia, l'utente può autorizzare il nuovo dominio dal popup.

- Sulle pagine HTTPS `/titles/{id}` lo script dedicato legge il titolo visibile, eventuali indicatori di stagione/episodio e la frazione del video solo se un elemento video è accessibile nello stesso documento o in un iframe same-origin.
- L'adapter server accetta soltanto URL HTTPS con un hostname che identifica StreamingCommunity e un percorso canonico `/titles/{id}`. Non scarica pagine del provider e non estrae URL multimediali.
- L'URL esatto osservato viene salvato come collegamento per “Continua”. Se il player è cross-origin o il sito cambia struttura, la posizione e/o l'episodio potrebbero non essere disponibili.
- Se il nome letto non corrisponde al catalogo CineLoop, il popup chiede di confermare il titolo una volta; l'abbinamento viene riutilizzato nelle osservazioni successive.

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

## Scelta manuale del servizio nella scheda titolo

Per i titoli della sezione anime, la scheda mostra "Da dove lo stai guardando?" con scelte manuali Netflix e Anime Unity. La scelta salva il provider e un link di ricerca nella posizione di progresso della libreria, senza inventare stagione o episodio se non sono ancora noti. Quando l'estensione osserva una riproduzione reale, il normale flusso di sincronizzazione sostituisce il link di ricerca con l'URL preciso della pagina e aggiorna provider, episodio e avanzamento.

- Netflix apre la ricerca del titolo su Netflix.
- Anime Unity apre la ricerca del titolo nel percorso `/filter?search=...`, non la homepage.
- Un link di ricerca non riceve il parametro di ripresa del video. Il seek viene aggiunto soltanto a una pagina Anime Unity `/anime/{id}` già osservata.
- La scelta manuale è un aiuto temporaneo; la rilevazione dell'estensione resta la fonte più precisa per la pagina, l'episodio e il progresso.

## Anime sources

Anime go to the anime sources first; TMDB answers only when they have nothing (`ANIME_SOURCES=off` turns them off).

- **Anime News Network** (Encyclopedia API, the public XML feed): the franchise. Search by title, then entries linked by prequel / sequel / side story / summary are followed (never adaptations, remakes or the loose "related" links; ANN words them "sequel" / "sequel of", "side story" / "side story of"). One title per franchise, TV entries as seasons, films / OVAs / specials as parts of its **Ordine di visione** (release order). Calls are at least a second apart and cached for a week.
- **Anime Filler List**: no API, so its public show page is read, one page per long-running show (26+ episodes), cached for a month. Only episodes it lists as pure "Filler" are skipped by default.
- **AniDB**: not connected. Its HTTP API cannot search by name (only through a daily dump file) and needs a client registered on anidb.net.
- Default choice per part: known non-canon (recaps) and OVAs / specials are off, everything else is on; the user switches parts and "Guarda anche i filler" on the title page. What is off does not count for progress, "finished" or "Novità".
- None of the three services can be reached from the development sandbox: the parsers are tested on fixtures that follow the documented format, not on live answers.
- Check page: signed in, open `/api/diagnostics/sources` (add `?seed=25066` to build one franchise end to end). It shows what ANN and Anime Filler List answer from the server, whether TMDB is active, and how many upcoming releases are found.
