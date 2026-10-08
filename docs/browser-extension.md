# Estensione browser (progetto)

Stato: **non implementata**. Questo documento descrive come dovrebbe funzionare perché il lato server (`ObservationAdapter`, `SyncObservation`) è già pronto a riceverla. Prima di attivarla per Netflix serve la verifica descritta in [providers.md](./providers.md).

## Obiettivo

Far sapere a CineLoop cosa l'utente sta guardando, **solo** nella scheda che l'utente ha aperto, **solo** sui servizi che ha attivato e **solo** con dati che il browser mostra già all'utente.

## Cosa legge

Per ogni scheda di un servizio attivato, al cambio di URL:

- l'URL della pagina (es. `https://www.netflix.com/watch/80057281`);
- il titolo del documento (es. `Stranger Things - Netflix`);
- eventuali metadati pubblici della pagina (`og:title`), se presenti.

## Cosa non legge, mai

- Cookie, localStorage, token, header di rete o richieste del player.
- Il DOM del player, il flusso video o i sottotitoli.
- Pagine di servizi non attivati dall'utente, né qualsiasi altro sito.

## Flusso

1. L'utente installa l'estensione e la collega al proprio account CineLoop con un codice monouso mostrato nelle impostazioni. L'estensione riceve un token CineLoop dedicato e revocabile, mai le credenziali del provider.
2. L'utente sceglie i servizi da osservare. I permessi host dell'estensione sono richiesti a runtime, uno per servizio (`chrome.permissions.request`), non tutti all'installazione.
3. Al cambio di URL in una scheda osservata, l'estensione invia a CineLoop una `SyncObservation`:

```ts
interface SyncObservation {
  providerId: ProviderId;
  url: string;
  documentTitle: string;
  hints?: { title?: string; season?: number; episode?: number };
  observedAt: string;
}
```

4. Il server passa l'osservazione all'adapter del provider (`getAdapter(id)`). Se l'adapter ha `detectCurrentContent` attivo, `parse()` la trasforma in contenuto; altrimenti viene scartata.
5. Il `CatalogService` abbina il titolo al catalogo. CineLoop aggiorna "Ora in visione" e lo storico.

## Requisiti tecnici

- Manifest V3, service worker, nessun codice remoto.
- Permessi: `tabs` (solo URL e titolo) più host permission opzionali per servizio. Niente `cookies`, `webRequest` o `scripting` sul player.
- Endpoint server dedicato (`POST /api/sync/observations`), autenticato con il token dell'estensione, con rate limit e validazione zod dello schema sopra.
- Pausa e disconnessione con un clic. Elenco delle osservazioni ricevute visibile all'utente nelle impostazioni.

## Perché ancora non c'è

I termini di Netflix vietano l'accesso al servizio con mezzi automatici. Un'estensione che legge URL e titolo della scheda aperta dall'utente non accede al servizio al suo posto, ma la valutazione va completata (idealmente con un parere legale) prima di distribuirla. Nel frattempo l'import del CSV ufficiale è il percorso consigliato.
