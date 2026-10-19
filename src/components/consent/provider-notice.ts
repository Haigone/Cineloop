import type { ConsentProvider } from "@/domain/types";

/** Wording of the notice for each service that needs one. */
export const PROVIDER_NOTICE: Record<ConsentProvider, { name: string; lead: string; detail: string }> = {
  animeunity: {
    name: "AnimeUnity",
    lead: "AnimeUnity è un sito di streaming non ufficiale: non ha la licenza dei contenuti che offre.",
    detail: "Se lo attivi, l’estensione legge solo indirizzo e titolo della scheda di animeunity.to che hai aperto tu e il punto del video, per aggiornare la tua libreria.",
  },
  streamingcommunity: {
    name: "StreamingCommunity",
    lead: "StreamingCommunity è un sito di streaming non ufficiale: non ha la licenza dei contenuti che offre.",
    detail:
      "Se lo attivi, l’estensione legge solo indirizzo e titolo della scheda che hai aperto tu e il punto del video. Il sito cambia dominio spesso: quando succede, il browser ti chiede il permesso per quello nuovo.",
  },
};

export const PROVIDER_NOTICE_FOOTER =
  "CineLoop non lo gestisce né lo promuove, non riproduce nulla e non usa le tue credenziali. Usarlo è una scelta e una responsabilità tue. Puoi cambiare idea quando vuoi da Impostazioni.";
