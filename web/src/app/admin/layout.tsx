import { BottomNav } from "@/components/bottom-nav";
import { requireOwner } from "@/lib/auth";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireOwner();
  return (
    <>
      <main className="mx-auto max-w-2xl px-4 pb-28 pt-5">{children}</main>
      <BottomNav />
    </>
  );
}
