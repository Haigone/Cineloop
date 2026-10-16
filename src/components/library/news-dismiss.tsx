"use client";

import { useState, useTransition } from "react";
import { BellRing, BellOff, X } from "lucide-react";
import type { TitleUpdates } from "@/domain/types";
import { setTitleUpdates } from "@/server/actions/library";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

/**
 * The X on a Novità title: asks to confirm "Non mi interessa più", then whether
 * the user still wants a notification on release day or nothing at all.
 * Either way the series leaves Novità; the toast can put it back.
 */
export function NewsDismiss({ titleId, titleName, appearance = "overlay" }: { titleId: string; titleName: string; /** "overlay": on a poster. "plain": in a list row. */ appearance?: "overlay" | "plain" }) {
  const [step, setStep] = useState<"closed" | "confirm" | "choose">("closed");
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState<TitleUpdates | null>(null);
  const toast = useToast();

  function save(updates: TitleUpdates, silent = false) {
    setChosen(updates);
    startTransition(async () => {
      const res = await setTitleUpdates(titleId, updates);
      if (!res.ok) {
        toast.show(res.error, { tone: "error" });
        return;
      }
      setStep("closed");
      if (silent) return;
      toast.show(updates === "releaseDay" ? `${titleName} tolto dalle Novità: ti avvisiamo il giorno dell’uscita` : `${titleName} tolto dalle Novità`, {
        action: { label: "Annulla", onClick: () => save("all", true) },
      });
    });
  }

  return (
    <>
      <button
        type="button"
        aria-label={`Togli ${titleName} dalle Novità`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setStep("confirm");
        }}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full border transition-colors",
          appearance === "overlay" ? "size-9 border-white/10 bg-black/45 text-white backdrop-blur-md hover:bg-black/65" : "size-8 border-line text-fg-2 hover:bg-white/[0.06] hover:text-fg",
        )}
      >
        <X aria-hidden className="size-4" />
      </button>
      <Modal
        open={step === "confirm"}
        onClose={() => setStep("closed")}
        title={`Togliere ${titleName} dalle Novità?`}
        description="Confermi che non ti interessa più?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setStep("closed")}>
              Annulla
            </Button>
            <Button variant="danger" onClick={() => setStep("choose")}>
              Non mi interessa più
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-2">La serie resta nella tua libreria con i tuoi progressi: sparisce solo dalle Novità.</p>
      </Modal>
      <Modal
        open={step === "choose"}
        onClose={() => (pending ? undefined : setStep("closed"))}
        title="Vuoi ancora sapere quando esce qualcosa?"
        description={`${titleName} non comparirà più nelle Novità.`}
      >
        <div className="grid gap-2">
          <ChoiceButton
            icon={<BellRing aria-hidden className="size-5 text-accent" />}
            label="Avvisami il giorno dell’uscita"
            detail="Ti arriva una notifica il giorno in cui esce una nuova stagione o un nuovo episodio."
            loading={pending && chosen === "releaseDay"}
            disabled={pending}
            onClick={() => save("releaseDay")}
          />
          <ChoiceButton
            icon={<BellOff aria-hidden className="size-5 text-fg-3" />}
            label="Nessun aggiornamento"
            detail="Non ti diciamo più niente di questa serie."
            loading={pending && chosen === "none"}
            disabled={pending}
            onClick={() => save("none")}
          />
        </div>
      </Modal>
    </>
  );
}

function ChoiceButton({ icon, label, detail, loading, disabled, onClick }: { icon: React.ReactNode; label: string; detail: string; loading: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={loading || undefined}
      className="flex items-start gap-3 rounded-lg border border-line-strong bg-white/[0.03] p-3 text-left transition-colors hover:border-white/20 hover:bg-white/[0.07] disabled:opacity-60"
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>
        <span className="block text-sm font-medium text-fg">{loading ? "Salvo…" : label}</span>
        <span className="mt-0.5 block text-[13px] text-fg-2">{detail}</span>
      </span>
    </button>
  );
}
