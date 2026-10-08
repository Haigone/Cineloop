"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "./button";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

/** Recoverable error panel. Never shows raw technical messages. */
export function ErrorState({
  title = "Questa sezione non si è caricata",
  description = "Può essere un problema di connessione. Riprova tra un momento.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-line-strong bg-surface p-6">
      <span className="flex size-9 items-center justify-center rounded-full bg-accent-soft text-accent" aria-hidden>
        <TriangleAlert className="size-4" />
      </span>
      <div>
        <p className="font-medium text-fg">{title}</p>
        <p className="mt-1 text-sm text-fg-2">{description}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" icon={<RefreshCw aria-hidden className="size-3.5" />} onClick={onRetry}>
          Riprova
        </Button>
      )}
    </div>
  );
}
