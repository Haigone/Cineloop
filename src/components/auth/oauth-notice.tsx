"use client";

import { useSearchParams } from "next/navigation";

const MESSAGES: Record<string, string> = {
  annullato: "Accesso annullato. Puoi riprovare quando vuoi.",
  errore: "Non siamo riusciti a completare l’accesso. Riprova tra un momento.",
  "senza-email": "Questo account non ha un’email verificata. Verificala sul servizio e riprova, oppure usa un altro metodo.",
  "gia-collegato": "Quell’account è già collegato a un altro profilo CineLoop.",
  "non-attivo": "Questo metodo di accesso non è ancora attivo.",
};

/** The message for `?accesso=…`, set when the Google / Discord round trip comes back with a problem. */
export function OAuthNotice({ className = "mb-4" }: { className?: string }) {
  const message = MESSAGES[useSearchParams().get("accesso") ?? ""];
  if (!message) return null;
  return (
    <p role="alert" className={`rounded-md border border-accent/30 bg-accent-soft px-3.5 py-2.5 text-sm text-fg ${className}`}>
      {message}
    </p>
  );
}
