import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { Card, Field, Input } from "@/components/ui";
import { checkOwnerPassword, createSession, isOwner } from "@/lib/auth";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Masuk" };

async function login(formData: FormData) {
  "use server";
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/admin");
  if (!checkOwnerPassword(password)) redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  await createSession();
  redirect(next.startsWith("/admin") ? next : "/admin");
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  if (await isOwner()) redirect("/admin");
  const next = typeof sp.next === "string" ? sp.next : "/admin";
  return (
    <main className="bg-sky-hero flex min-h-dvh flex-col justify-center p-6">
      <div className="mx-auto w-full max-w-sm">
      <div className="mb-6 flex flex-col items-center">
        <Logo size={44} />
        <p className="mt-4 font-display text-2xl font-extrabold uppercase italic text-brand-700">Back-office</p>
      </div>
      <Card>
        <form action={login} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <Field label="Password">
            <Input type="password" name="password" required autoFocus autoComplete="current-password" />
          </Field>
          {sp.error && <p className="text-sm text-red-600">Password salah.</p>}
          <SubmitButton className="w-full">Masuk</SubmitButton>
        </form>
      </Card>
      </div>
    </main>
  );
}
