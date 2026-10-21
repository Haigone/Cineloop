# Pubblicità e donazioni

Tutto è spento finché non si impostano le variabili su Vercel (nessuna migrazione). Codice: `src/lib/support.ts`, `src/components/layout/support-footer.tsx`, `ad-unit.tsx`; compare solo in fondo alle pagine dell'app, mai su `/start` o nell'estensione.

| Variabile | Effetto |
|---|---|
| `DONATION_URL` | Link https (Ko-fi, Buy Me a Coffee, PayPal.me): mostra "Offrimi un caffè" in fondo alla pagina. |
| `ADS_ENABLED=true`, `ADSENSE_CLIENT=ca-pub-…`, `ADSENSE_SLOT=…` | Un riquadro "Pubblicità" (altezza fissa, niente salti di layout). Servono tutte e tre. |

Reti compatibili: Google AdSense (richiede dominio proprio e approvazione; il sito deve avere contenuto originale), Carbon/EthicalAds (più discrete, pensate per siti tecnici, meno adatte), Ezoic/Mediavine (soglie di traffico alte). Per ora AdSense.

Prima di accendere gli annunci: in UE servono banner di consenso cookie (CMP certificato Google) e aggiornare privacy/cookie policy. Il riquadro non include ancora un CMP. Gli annunci vanno accesi solo dopo il dominio e l'approvazione.
