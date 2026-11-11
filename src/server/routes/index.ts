import { r, type Route } from "../core";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { deviceRoutes } from "./device";
import { financeRoutes } from "./finance";
import { miscRoutes } from "./misc";
import { resourceRoutes } from "./resources";
import { salesRoutes } from "./sales";

const health = r("GET", "/health", { auth: "none" }, async () => {
  await db.execute(sql`select 1`);
  return { ok: true };
});

export const routes: Route[] = [health, ...deviceRoutes, ...financeRoutes, ...salesRoutes, ...resourceRoutes, ...miscRoutes];
