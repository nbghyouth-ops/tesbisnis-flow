export const ROLES = ["owner", "manager", "cashier", "staff", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const MODULES = [
  "finance", "sales", "inventory", "purchasing", "crm", "hr", "tasks", "booking",
  "ops", "marketing", "projects", "assets", "reports", "settings", "devices", "audit",
] as const;
export type Module = (typeof MODULES)[number];
export type Permission = `${Module}:${"read" | "write" | "approve" | "manage"}`;

const rw = (...m: Module[]) => m.flatMap((x) => [`${x}:read`, `${x}:write`]);
const r = (...m: Module[]) => m.map((x) => `${x}:read`);

const ROLE_PERMS: Record<Exclude<Role, "owner">, ReadonlySet<string>> = {
  manager: new Set([
    ...rw("finance", "sales", "inventory", "purchasing", "crm", "hr", "tasks", "booking", "ops", "marketing", "projects", "assets", "reports", "settings"),
    "finance:approve", "audit:read", "devices:read",
  ]),
  cashier: new Set([...rw("sales", "crm", "booking"), ...r("inventory", "tasks", "ops")]),
  staff: new Set([...rw("tasks", "ops", "booking"), ...r("crm", "inventory")]),
  viewer: new Set(r("finance", "sales", "inventory", "purchasing", "crm", "hr", "tasks", "booking", "ops", "marketing", "projects", "assets", "reports")),
};

export function can(role: string, perm: Permission): boolean {
  if (role === "owner") return true;
  return ROLE_PERMS[role as Exclude<Role, "owner">]?.has(perm) ?? false;
}
