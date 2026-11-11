import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { LockProvider } from "@/components/lock-provider";
import { Shell } from "@/components/shell";
import { currentGrant } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const g = await currentGrant();
  if (!g) redirect("/");
  return (
    <LockProvider init={g}>
      <Shell>{children}</Shell>
    </LockProvider>
  );
}
