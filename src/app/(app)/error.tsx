"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/error-state";

/** Catches failures inside the app shell, so navigation keeps working around them. */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl pt-10">
      <h1 className="sr-only">Errore</h1>
      <ErrorState
        title="Questa pagina non si è caricata."
        description={`Riprova tra un momento. Se il problema continua, ricarica la pagina.${error.digest ? ` Codice: ${error.digest}` : ""}`}
        onRetry={retry}
      />
    </div>
  );
}
