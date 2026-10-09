# Integrazioni con i provider

CineLoop non riproduce contenuti, non usa le credenziali dell'utente presso i provider e non aggira protezioni. Questo documento riassume cosa è stato verificato per ogni servizio, cosa è stato deciso e cosa resta da fare. Ultima verifica: ottobre 2026.

## Riepilogo

| Servizio | Stato in CineLoop | Cosa fa oggi | Percorso |
|---|---|---|---|
| Netflix | Rilevamento tramite estensione | "Ora in visione", libreria e tempo aggiornati dall'estensione dell'utente; link "Continua su Netflix" | Estensione CineLoop (URL e titolo della scheda) |
| Prime Video, Disney+, Apple TV+, NOW, Crunchyroll | In arrivo | Link alla homepage del servizio | Da studiare caso per caso (API ufficiali, export dei dati, partnership) |
| Anime Unity | Collegamento a pagina osservata | Riconosce un URL HTTPS Anime Unity ricevuto da una sorgente di osservazione già abilitata e può riaprire quella stessa pagina | URL della pagina fornito dall'utente/sorgente; nessuna ricerca o lettura automatica del sito |
| Streaming Community | Non supportato | Nulla: adapter stub | Nessuna |

## Netflix

L'adapter Netflix e l'estensione restano invariati da questa modifica. Non viene aggiunto alcun comportamento all'estensione.

## Anime Unity

L'adapter può interpretare un'osservazione già consegnata a CineLoop se contiene un URL HTTPS il cui hostname ha un'etichetta di dominio esattamente `animeunity`. Può conservare quell'URL come riferimento esterno e restituirlo per "Continua su…". Il titolo e gli indizi di stagione/episodio possono essere forniti dalla sorgente di osservazione; il parser non visita Anime Unity per recuperarli.

Limiti deliberati:
- Non effettua richieste HTTP al sito, scraping o scansione del catalogo.
- Non individua né estrae URL di stream o file multimediali.
- Non legge cookie, token o credenziali e non controlla il player.
- Non dichiara di conoscere la posizione temporale nel video: `progress` resta `false`.
- Il riconoscimento funziona solo se una sorgente già autorizzata invia a CineLoop l'osservazione con `providerId: "animeunity"`. Il codice dell'estensione Netflix non è stato modificato per inviarla; quindi questo adapter, da solo, non abilita il rilevamento automatico nelle schede Anime Unity.

## Streaming Community

Resta non supportato. Questo lavoro non modifica il suo adapter, i metadati o i test relativi a quel provider.
