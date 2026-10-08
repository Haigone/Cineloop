import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { LogOut } from "lucide-react";
import { logout } from "@/server/actions/auth";
import { getSettingsView } from "@/server/services/settings";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { ExtensionSettings } from "@/components/settings/extension-settings";
import { PasswordForm } from "@/components/settings/password-form";
import { PreferenceSwitch } from "@/components/settings/preference-switch";
import { ProfileForm } from "@/components/settings/profile-form";
import { SubscriptionList } from "@/components/settings/subscription-list";
import { VisibilityPicker } from "@/components/settings/visibility-picker";

export const metadata: Metadata = { title: "Impostazioni" };

const SECTIONS = [
  { id: "profilo", label: "Profilo" },
  { id: "account", label: "Account" },
  { id: "privacy", label: "Privacy" },
  { id: "notifiche", label: "Notifiche" },
  { id: "servizi", label: "I tuoi servizi" },
  { id: "estensione", label: "Estensione Netflix" },
  { id: "accessibilita", label: "Aspetto e accessibilità" },
] as const;

export default function SettingsPage() {
  return (
    <>
      <SectionHeader as="h1" title="Impostazioni" />
      <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)] xl:gap-12">
        <nav aria-label="Sezioni delle impostazioni" className="max-lg:hidden">
          <ul className="sticky top-[calc(var(--topbar-height)+24px)] flex flex-col gap-0.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="block rounded-md px-3 py-2 text-sm text-fg-2 transition-colors hover:bg-white/[0.04] hover:text-fg">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <Suspense
          fallback={
            <LoadingRegion label="Caricamento delle impostazioni" className="flex max-w-3xl flex-col gap-6">
              <Skeleton className="h-72 rounded-xl" />
              <Skeleton className="h-56 rounded-xl" />
            </LoadingRegion>
          }
        >
          <SettingsContent />
        </Suspense>
      </div>
    </>
  );
}

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-[calc(var(--topbar-height)+24px)] rounded-xl border border-line bg-surface p-5 md:p-6">
      <h2 id={`${id}-h`} className="text-[17px] font-semibold tracking-[-0.01em]">
        {title}
      </h2>
      {description && <p className="mt-1 max-w-[62ch] text-sm text-fg-2">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

async function SettingsContent() {
  const { user, preferences: p, providers, devices } = await getSettingsView();
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Section id="profilo" title="Profilo" description="Come ti vedono gli amici su CineLoop.">
        <ProfileForm displayName={user.displayName} bio={user.bio ?? ""} username={user.username} />
      </Section>

      <Section id="account" title="Account">
        <dl className="mb-6 flex flex-col gap-1">
          <dt className="text-[13px] font-medium text-fg">Email</dt>
          <dd className="text-sm text-fg-2">{user.email}</dd>
        </dl>
        <h3 className="mb-3 text-sm font-medium text-fg">Cambia password</h3>
        <PasswordForm />
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          <p className="text-sm text-fg-2">Esci da CineLoop su questo dispositivo.</p>
          <form action={logout}>
            <Button type="submit" variant="ghost" icon={<LogOut aria-hidden className="size-4" />}>
              Esci
            </Button>
          </form>
        </div>
      </Section>

      <Section id="privacy" title="Privacy" description="Decidi tu cosa vedono gli altri. Le modifiche si salvano subito.">
        <div className="divide-y divide-line">
          <VisibilityPicker initial={p.profileVisibility} />
          <PreferenceSwitch
            name="shareActivity"
            initial={p.shareActivity}
            label="Condividi la tua attività"
            description="Gli amici vedono cosa stai guardando e i voti che dai. Se lo disattivi sparisci dai loro feed."
          />
        </div>
      </Section>

      <Section id="notifiche" title="Notifiche" description="Scegli per cosa vuoi essere avvisato nella campanella.">
        <div className="divide-y divide-line">
          <PreferenceSwitch name="notifyWatchParty" initial={p.notifyWatchParty} label="Serate insieme" description="Inviti e titoli scelti per le serate a cui partecipi." />
          <PreferenceSwitch name="notifySuggestions" initial={p.notifySuggestions} label="Consigli degli amici" description="Quando un amico ti consiglia un titolo." />
          <PreferenceSwitch
            name="notifyFriendActivity"
            initial={p.notifyFriendActivity}
            label="Attività degli amici"
            description="Voti alti e titoli finiti dalle persone che segui."
          />
        </div>
      </Section>

      <Section
        id="servizi"
        title="I tuoi servizi"
        description="Indica le piattaforme che usi: i suggerimenti daranno priorità a quello che puoi già guardare. CineLoop non riproduce contenuti e non accede ai tuoi account."
      >
        <SubscriptionList providers={providers} initial={p.subscriptions} />
      </Section>

      <Section
        id="estensione"
        title="Estensione Netflix"
        description="Mentre guardi Netflix, CineLoop aggiorna da solo la libreria e mostra agli amici cosa stai guardando, così possono unirsi a te."
      >
        <ExtensionSettings devices={devices} />
      </Section>

      <Section id="accessibilita" title="Aspetto e accessibilità">
        <div className="divide-y divide-line">
          <div className="flex items-start justify-between gap-6 pb-4">
            <div>
              <p className="text-sm text-fg">Tema</p>
              <p className="mt-0.5 max-w-[56ch] text-[13px] text-fg-3">CineLoop usa un tema scuro pensato per la sera. Un tema chiaro arriverà più avanti.</p>
            </div>
            <span className="mt-0.5 rounded-md border border-line-strong px-2.5 py-1 text-[13px] text-fg-2">Scuro</span>
          </div>
          <PreferenceSwitch
            name="reduceMotion"
            initial={p.reduceMotion}
            label="Riduci animazioni"
            description="Disattiva transizioni e movimenti, anche la ruota della serata. Vale in aggiunta all'impostazione del sistema."
          />
        </div>
      </Section>
    </div>
  );
}
