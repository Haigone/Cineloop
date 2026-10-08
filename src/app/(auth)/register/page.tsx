import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = { title: "Crea account" };

export default function RegisterPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Crea il tuo account</h1>
      <p className="mt-1.5 mb-8 text-sm text-fg-2">Un posto solo per tutto quello che guardi, su qualsiasi piattaforma.</p>
      <RegisterForm />
    </>
  );
}
