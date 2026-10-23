"use client";

import { useEffect, useState } from "react";
import { ErrorState } from "@/components/ui/error-state";

/** Catches failures inside the app shell, so navigation keeps working around them. */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const [databaseDown, setDatabaseDown] = useState(false);
  useEffect(() => {
    // Production hides the real error, so ask a tiny endpoint whether the database answers at all.
    fetch("/api/health", { cache: "no-store" })
      .then((res) => setDatabaseDown(res.status === 503))
      .catch(() => {});
  }, [error]);

  return (
    <div className="mx-auto max-w-xl pt-10">
      <h1 className="sr-only">Errore</h1>
      <ErrorState
        title={databaseDown ? "Database temporaneamente non raggiungibile." : "Questa pagina non si è caricata."}
        description={databaseDown ? "CineLoop non riesce a leggere i tuoi dati in questo momento. Non è andato perso nulla: riprova tra poco." : `Riprova tra un momento. Se il problema continua, ricarica la pagina.${error.digest ? ` Codice: ${error.digest}` : ""}`}
        onRetry={retry}
      />
    </div>
  );
}
