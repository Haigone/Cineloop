"use client";

import { useId } from "react";
import type { PreferencesPatch } from "@/server/actions/settings";
import { Switch } from "@/components/ui/switch";
import { usePreference } from "./use-preference";

type BooleanKey = { [K in keyof PreferencesPatch]-?: NonNullable<PreferencesPatch[K]> extends boolean ? K : never }[keyof PreferencesPatch];

/** One settings row: label and explanation on the left, switch on the right. Saves on change. */
export function PreferenceSwitch({ name, initial, label, description }: { name: BooleanKey; initial: boolean; label: string; description: string }) {
  const id = useId();
  const [value, set] = usePreference(name, initial);
  return (
    <div className="flex items-start justify-between gap-6 py-4">
      <div className="min-w-0">
        <p id={`${id}-label`} className="text-sm text-fg">
          {label}
        </p>
        <p id={`${id}-desc`} className="mt-0.5 max-w-[56ch] text-[13px] text-fg-3">
          {description}
        </p>
      </div>
      <Switch checked={value} onChange={set} labelledBy={`${id}-label`} describedBy={`${id}-desc`} className="mt-0.5" />
    </div>
  );
}
