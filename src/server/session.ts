import { cookies } from "next/headers";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses, deviceGrants, devices } from "@/db/schema";
import { sha256 } from "@/lib/crypto";
import { DEVICE_COOKIE } from "./core";

/** Untuk Server Component: hanya info non-sensitif (nama bisnis/perangkat) agar layar PIN dapat ditampilkan. */
export async function currentGrant() {
  const token = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (!token || token.length > 200) return null;
  const [d] = await db.select().from(devices).where(and(eq(devices.tokenHash, sha256(token)), eq(devices.status, "active"))).limit(1);
  if (!d) return null;
  const [g] = await db.select().from(deviceGrants).where(and(eq(deviceGrants.deviceId, d.id), eq(deviceGrants.status, "active"))).orderBy(desc(deviceGrants.createdAt)).limit(1);
  if (!g) return null;
  const [b] = await db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, g.businessId));
  return { businessName: b?.name ?? "Business Flow", deviceName: d.name, operatorName: d.operatorName, pinLength: d.pinLength ?? 6 };
}
