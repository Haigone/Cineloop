# Integrazioni con i provider

CineLoop non riproduce contenuti e non legge credenziali o cookie del provider. La sincronizzazione Anime Unity usa esclusivamente la pagina aperta dall'utente e le informazioni di titolo/episodio/progresso già lette dall'estensione CineLoop.

## Riepilogo

| Servizio | Stato in CineLoop | Cosa fa oggi |
|---|---|---|
| Netflix | Rilevamento tramite estensione | Il comportamento Netflix resta invariato in questa modifica |
| Anime Unity | Disponibile tramite estensione CineLoop | Rileva la pagina anime, il titolo, l'episodio e la frazione del video; salva il progresso e può riaprire la stessa pagina al punto registrato |
| Prime Video, Disney+, Apple TV+, NOW, Crunchyroll | In arrivo | Collegamenti e integrazioni da verificare |
| Streaming Community | Non supportato | Rimane invariato |

## Anime Unity

L'estensione CineLoop ha già un permesso host opzionale per https://www.animeunity.so/* e uno script dedicato alla pagina. Dopo che l'utente concede il permesso dal popup, il server ora riconosce le osservazioni Anime Unity e registra titolo, stagione/episodio e frazione del video quando disponibili.

- Le osservazioni sono accettate solo per pagine HTTPS del dominio animeunity.so (o suoi sottodomini) nel percorso /anime/{id}.
- Il progresso usa la frazione del video fornita dall'estensione; non si tenta di leggere player cross-origin o estrarre URL multimediali.
- La libreria salva l'URL della pagina osservata. Il comando Continua aggiunge un parametro temporaneo con la frazione salvata; lo script Anime Unity lo usa per cercare di riposizionare il video una volta caricati i metadati, poi rimuove il parametro dall'URL.
- Le pagine anime di CineLoop includono anche un collegamento alla homepage di Anime Unity. Quando esiste un progresso salvato, Continua preferisce invece la pagina esatta registrata.
- La sorgente dei metadati del catalogo resta TMDB/il catalogo locale configurato: l'attivazione del provider non rende il catalogo anime esaustivo né fa scraping del sito.

Il ripristino della posizione dipende dal fatto che il player consenta la ricerca temporale e che la pagina salvata apra lo stesso episodio. Se Anime Unity cambia la struttura del sito o il player non espone un elemento video accessibile, il rilevamento della posizione può non funzionare.

## Netflix e Streaming Community

Il codice Netflix dell'estensione non è stato modificato. Streaming Community rimane disabilitato e il suo adapter non è stato modificato.
