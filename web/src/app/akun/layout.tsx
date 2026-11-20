import Link from "next/link";
import { Logo } from "@/components/logo";
import { getMember } from "@/lib/member";
import { logout } from "./actions";

export const metadata = { robots: { index: false } };

const tabs = [
  { href: "/akun", label: "Order" },
  { href: "/akun/penumpang", label: "Penumpang" },
  { href: "/akun/poin", label: "Poin" },
];

export default async function AkunLayout({ children }: LayoutProps<"/akun">) {
  const member = await getMember();
  return (
    <div className="bg-sky-hero min-h-dvh">
      <header className="mx-auto flex max-w-lg items-center justify-between px-4 pt-6">
        <Link href="/">
          <Logo size={30} />
        </Link>
        {member && (
          <form action={logout}>
            <button className="text-xs font-semibold text-ink/50 underline">Keluar</button>
          </form>
        )}
      </header>
      {member && (
        <nav className="mx-auto mt-4 flex max-w-lg gap-2 px-4">
          {tabs.map((t) => (
            <Link key={t.href} href={t.href} className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-brand-700 shadow-sm ring-1 ring-brand-100">
              {t.label}
            </Link>
          ))}
        </nav>
      )}
      <main className="mx-auto max-w-lg px-4 pb-16 pt-5">{children}</main>
    </div>
  );
}
