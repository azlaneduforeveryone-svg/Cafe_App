import Link from "next/link";
import { notFound } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { isAdminEmail } from "@/lib/billing";
import { listClients } from "@/lib/clients";
import { ClientAdmin } from "@/components/admin/ClientAdmin";

export const dynamic = "force-dynamic";

/** Platform admin: create a restaurant for a client. Only logins in ADMIN_EMAILS can open it. English only. */
export default async function AdminClientsPage() {
  const ctx = await getStaff();
  if (!ctx || !isAdminEmail(ctx.staff.email)) notFound();
  const clients = await listClients();

  return (
    <div dir="ltr" lang="en" className="min-h-screen bg-cream">
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-extrabold">Clients</h1>
          <nav className="flex gap-4 font-bold">
            <Link href="/admin/billing" className="text-ember hover:underline">
              Billing admin
            </Link>
            <Link href="/dashboard" className="text-ember hover:underline">
              Back to the app
            </Link>
          </nav>
        </div>
        <ClientAdmin clients={clients} />
      </main>
    </div>
  );
}
