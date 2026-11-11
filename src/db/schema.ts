import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Business Flow schema. Domain dikelompokkan lewat prefix komentar (core, devices, finance, ...).
 * Semua tabel tenant memiliki workspace_id + business_id. Uang = NUMERIC(18,2), kuantitas = NUMERIC(18,3).
 */
const pk = () => uuid("id").primaryKey().defaultRandom();
const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const money = (n: string) => numeric(n, { precision: 18, scale: 2 }).notNull().default("0");
const qty = (n: string) => numeric(n, { precision: 18, scale: 3 }).notNull().default("0");
const ws = () => uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" });
const biz = () => uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" });

/* ───────────── core ───────────── */
export const workspaces = pgTable("workspaces", {
  id: pk(),
  name: text("name").notNull(),
  createdAt: created(),
});

export const businesses = pgTable("businesses", {
  id: pk(),
  workspaceId: ws(),
  name: text("name").notNull(),
  legalName: text("legal_name"),
  tradeName: text("trade_name"),
  slogan: text("slogan"),
  description: text("description"),
  templateKey: text("template_key").notNull().default("other"),
  businessModel: text("business_model"),
  industry: text("industry"),
  status: text("status").notNull().default("active"),
  currency: text("currency").notNull().default("IDR"),
  timezone: text("timezone").notNull().default("Asia/Jakarta"),
  language: text("language").notNull().default("id"),
  dateFormat: text("date_format").notNull().default("DD/MM/YYYY"),
  country: text("country"),
  province: text("province"),
  city: text("city"),
  address: text("address"),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: created(),
});

export const branches = pgTable("branches", {
  id: pk(),
  workspaceId: ws(),
  businessId: biz(),
  name: text("name").notNull(),
  code: text("code"),
  address: text("address"),
  isMain: boolean("is_main").notNull().default(false),
  status: text("status").notNull().default("active"),
  createdAt: created(),
});

export const warehouses = pgTable("warehouses", {
  id: pk(),
  workspaceId: ws(),
  businessId: biz(),
  branchId: uuid("branch_id").references(() => branches.id),
  name: text("name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  status: text("status").notNull().default("active"),
  createdAt: created(),
});

/* ───────────── devices (tanpa akun manusia) ───────────── */
export const devices = pgTable("devices", {
  id: pk(),
  tokenHash: text("token_hash").notNull().unique(),
  name: text("name").notNull().default("Perangkat"),
  operatorName: text("operator_name"),
  pinHash: text("pin_hash"),
  pinLength: integer("pin_length"),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  status: text("status").notNull().default("active"), // active | revoked
  createdAt: created(),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
});

export const deviceGrants = pgTable(
  "device_grants",
  {
    id: pk(),
    deviceId: uuid("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
    workspaceId: ws(),
    businessId: biz(),
    branchId: uuid("branch_id").references(() => branches.id),
    role: text("role").notNull(), // owner | manager | cashier | staff | viewer
    status: text("status").notNull().default("active"), // active | revoked
    createdAt: created(),
  },
  (t) => [uniqueIndex("device_grants_device_ws").on(t.deviceId, t.workspaceId)],
);

export const tabSessions = pgTable(
  "tab_sessions",
  {
    id: pk(),
    tokenHash: text("token_hash").notNull().unique(),
    deviceId: uuid("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [index("tab_sessions_device").on(t.deviceId)],
);

export const pairingCodes = pgTable("pairing_codes", {
  id: pk(),
  codeHash: text("code_hash").notNull().unique(),
  workspaceId: ws(),
  businessId: biz(),
  role: text("role").notNull(),
  createdByDeviceId: uuid("created_by_device_id").references(() => devices.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  usedByDeviceId: uuid("used_by_device_id").references(() => devices.id),
  createdAt: created(),
});

export const onboardingDrafts = pgTable("onboarding_drafts", {
  id: pk(),
  deviceId: uuid("device_id").notNull().unique().references(() => devices.id, { onDelete: "cascade" }),
  step: integer("step").notNull().default(0),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ───────────── legal ───────────── */
export const legalDocuments = pgTable(
  "legal_documents",
  {
    id: pk(),
    kind: text("kind").notNull(), // terms | privacy
    version: text("version").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: text("status").notNull().default("published"),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("legal_documents_kind_version").on(t.kind, t.version)],
);

export const legalAcceptances = pgTable("legal_acceptances", {
  id: pk(),
  workspaceId: ws(),
  deviceId: uuid("device_id").references(() => devices.id),
  documentId: uuid("document_id").notNull().references(() => legalDocuments.id),
  kind: text("kind").notNull(),
  version: text("version").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ───────────── audit / infra ───────────── */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: pk(),
    workspaceId: ws(),
    deviceId: uuid("device_id"),
    operator: text("operator"),
    action: text("action").notNull(),
    resource: text("resource").notNull(),
    resourceId: text("resource_id"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: created(),
  },
  (t) => [index("audit_ws_created").on(t.workspaceId, t.createdAt)],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: pk(),
    workspaceId: ws(),
    key: text("key").notNull(),
    response: jsonb("response").$type<unknown>(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("idem_ws_key").on(t.workspaceId, t.key)],
);

export const docCounters = pgTable(
  "doc_counters",
  {
    workspaceId: ws(),
    key: text("key").notNull(),
    value: integer("value").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.key] })],
);

export const notifications = pgTable("notifications", {
  id: pk(),
  workspaceId: ws(),
  businessId: biz(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: created(),
});

export const jobs = pgTable(
  "jobs",
  {
    id: pk(),
    workspaceId: ws(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    payloadVersion: integer("payload_version").notNull().default(1),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").notNull().default("pending"), // pending|leased|retry_wait|succeeded|dead_letter|cancelled
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull().defaultNow(),
    checkpoint: jsonb("checkpoint").$type<Record<string, unknown>>().notNull().default({}),
    lastError: text("last_error"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("jobs_idem").on(t.workspaceId, t.idempotencyKey), index("jobs_due").on(t.status, t.nextRunAt)],
);

/* ───────────── finance ───────────── */
export const coaAccounts = pgTable(
  "coa_accounts",
  {
    id: pk(),
    workspaceId: ws(),
    businessId: biz(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(), // asset|liability|equity|revenue|expense
    subtype: text("subtype"), // cash|bank|receivable|payable|inventory|tax|cogs|opening|variance
    isActive: boolean("is_active").notNull().default(true),
    createdAt: created(),
  },
  (t) => [uniqueIndex("coa_ws_code").on(t.workspaceId, t.code)],
);

export const cashAccounts = pgTable("cash_accounts", {
  id: pk(),
  workspaceId: ws(),
  businessId: biz(),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // cash | bank | ewallet
  coaAccountId: uuid("coa_account_id").notNull().references(() => coaAccounts.id),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: created(),
});

export const financeCategories = pgTable("finance_categories", {
  id: pk(),
  workspaceId: ws(),
  businessId: biz(),
  kind: text("kind").notNull(), // income | expense
  name: text("name").notNull(),
  coaAccountId: uuid("coa_account_id").notNull().references(() => coaAccounts.id),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: created(),
});

export const accountingPeriods = pgTable(
  "accounting_periods",
  {
    id: pk(),
    workspaceId: ws(),
    businessId: biz(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: text("status").notNull().default("open"), // open | closed
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [index("periods_ws").on(t.workspaceId, t.startDate)],
);

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: pk(),
    workspaceId: ws(),
    businessId: biz(),
    branchId: uuid("branch_id"),
    number: text("number").notNull(),
    entryDate: date("entry_date").notNull(),
    memo: text("memo"),
    source: text("source").notNull(),
    sourceId: uuid("source_id"),
    status: text("status").notNull().default("posted"), // posted | reversed
    reversesId: uuid("reverses_id"),
    reversedById: uuid("reversed_by_id"),
    deviceId: uuid("device_id"),
    operator: text("operator"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("je_ws_number").on(t.workspaceId, t.number), index("je_ws_date").on(t.workspaceId, t.entryDate)],
);

export const journalLines = pgTable(
  "journal_lines",
  {
    id: pk(),
    entryId: uuid("entry_id").notNull().references(() => journalEntries.id, { onDelete: "restrict" }),
    workspaceId: ws(),
    accountId: uuid("account_id").notNull().references(() => coaAccounts.id),
    debit: money("debit"),
    credit: money("credit"),
    memo: text("memo"),
  },
  (t) => [
    index("jl_entry").on(t.entryId),
    index("jl_account").on(t.workspaceId, t.accountId),
    check("jl_amounts", sql`${t.debit} >= 0 AND ${t.credit} >= 0 AND NOT (${t.debit} > 0 AND ${t.credit} > 0)`),
  ],
);

export const financeTransactions = pgTable(
  "finance_transactions",
  {
    id: pk(),
    workspaceId: ws(),
    businessId: biz(),
    branchId: uuid("branch_id"),
    number: text("number").notNull(),
    type: text("type").notNull(), // income | expense | transfer
    state: text("state").notNull().default("draft"), // draft|pending_approval|approved|posted|rejected|reversed
    amount: money("amount"),
    categoryId: uuid("category_id").references(() => financeCategories.id),
    accountId: uuid("account_id").notNull().references(() => cashAccounts.id),
    toAccountId: uuid("to_account_id").references(() => cashAccounts.id),
    txDate: date("tx_date").notNull(),
    txTime: text("tx_time"),
    note: text("note"),
    reference: text("reference"),
    clientId: uuid("client_id"),
    supplierName: text("supplier_name"),
    projectId: uuid("project_id"),
    journalId: uuid("journal_id"),
    requiresApproval: boolean("requires_approval").notNull().default(false),
    deviceId: uuid("device_id"),
    operator: text("operator"),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("ft_ws_number").on(t.workspaceId, t.number),
    index("ft_ws_date").on(t.workspaceId, t.txDate),
    check("ft_amount_pos", sql`${t.amount} > 0`),
    check("ft_transfer_diff", sql`${t.type} <> 'transfer' OR ${t.toAccountId} IS NOT NULL AND ${t.toAccountId} <> ${t.accountId}`),
  ],
);

export const budgets = pgTable(
  "budgets",
  {
    id: pk(),
    workspaceId: ws(),
    businessId: biz(),
    categoryId: uuid("category_id").notNull().references(() => financeCategories.id),
    month: text("month").notNull(), // YYYY-MM
    amount: money("amount"),
  },
  (t) => [uniqueIndex("budget_cat_month").on(t.workspaceId, t.categoryId, t.month)],
);

/* ───────────── crm ───────────── */
export const clients = pgTable(
  "clients",
  {
    id: pk(),
    workspaceId: ws(),
    businessId: biz(),
    code: text("code").notNull(),
    type: text("type").notNull().default("individual"),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    industry: text("industry"),
    status: text("status").notNull().default("active"), // active|inactive|archived|restricted|pending_deletion
    source: text("source"),
    notes: text("notes"),
    mergedIntoId: uuid("merged_into_id"),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [uniqueIndex("clients_ws_code").on(t.workspaceId, t.code)],
);

export const clientContacts = pgTable("client_contacts", {
  id: pk(),
  workspaceId: ws(),
  businessId: biz(),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  name: text("name").notNull(),
  title: text("title"),
  phone: text("phone"),
  email: text("email"),
  createdAt: created(),
});

export const clientActivities = pgTable(
  "client_activities",
  {
    id: pk(),
    workspaceId: ws(),
    businessId: biz(),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    kind: text("kind").notNull(), // meeting|call|visit|consultation|follow_up|note|contract
    summary: text("summary").notNull(),
    isInternal: boolean("is_internal").notNull().default(false),
    deviceId: uuid("device_id"),
    operator: text("operator"),
    createdAt: created(),
  },
  (t) => [index("ca_client").on(t.clientId, t.createdAt)],
);

/* ───────────── products / inventory ───────────── */
export const products = pgTable(
  "products",
  {
    id: pk(),
    workspaceId: ws(),
    businessId: biz(),
    sku: text("sku").notNull(),
    barcode: text("barcode"),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("product"), // product | service
    category: text("category"),
    unit: text("unit").notNull().default("pcs"),
    price: money("price"),
    avgCost: money("avg_cost"),
    trackStock: boolean("track_stock").notNull().default(true),
    reorderLevel: qty("reorder_level"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: created(),
  },
  (t) => [uniqueIndex("products_ws_sku").on(t.workspaceId, t.sku), check("products_price", sql`${t.price} >= 0`)],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: pk(),
    workspaceId: ws(),
    businessId: biz(),
    warehouseId: uuid("warehouse_id").notNull().references(() => warehouses.id),
    productId: uuid("product_id").notNull().references(() => products.id),
    quantity: numeric("quantity", { precision: 18, scale: 3 }).notNull(), // bertanda: + masuk, - keluar
    unitCost: money("unit_cost"),
    kind: text("kind").notNull(), // purchase_receipt|sale|sale_reversal|adjustment|opening
    refType: text("ref_type"),
    refId: uuid("ref_id"),
    note: text("note"),
    deviceId: uuid("device_id"),
    createdAt: created(),
  },
  (t) => [index("sm_product").on(t.workspaceId, t.productId, t.warehouseId)],
);

/* ───────────── sales ───────────── */
export const invoices = pgTable(
  "invoices",
  {
    id: pk(),
    workspaceId: ws(),
    businessId: biz(),
    branchId: uuid("branch_id"),
    number: text("number").notNull(),
    clientId: uuid("client_id").references(() => clients.id),
    channel: text("channel").notNull().default("pos"), // pos | invoice
    status: text("status").notNull().default("unpaid"), // unpaid|partial|paid|reversed
    subtotal: money("subtotal"),
    discount: money("discount"),
    tax: money("tax"),
    total: money("total"),
    paid: money("paid"),
    cogs: money("cogs"),
    journalId: uuid("journal_id"),
    dueDate: date("due_date"),
    note: text("note"),
    deviceId: uuid("device_id"),
    operator: text("operator"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("inv_ws_number").on(t.workspaceId, t.number),
    index("inv_ws_issued").on(t.workspaceId, t.issuedAt),
    check("inv_paid_range", sql`${t.paid} >= 0 AND ${t.paid} <= ${t.total}`),
  ],
);

export const invoiceLines = pgTable("invoice_lines", {
  id: pk(),
  workspaceId: ws(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  productId: uuid("product_id").notNull().references(() => products.id),
  description: text("description").notNull(),
  quantity: qty("quantity"),
  unitPrice: money("unit_price"),
  unitCost: money("unit_cost"),
  lineTotal: money("line_total"),
});

export const payments = pgTable(
  "payments",
  {
    id: pk(),
    workspaceId: ws(),
    businessId: biz(),
    invoiceId: uuid("invoice_id").references(() => invoices.id),
    billId: uuid("bill_id"),
    accountId: uuid("account_id").notNull().references(() => cashAccounts.id),
    amount: money("amount"),
    reference: text("reference"),
    journalId: uuid("journal_id"),
    reversed: boolean("reversed").notNull().default(false),
    deviceId: uuid("device_id"),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("pay_pos", sql`${t.amount} > 0`)],
);

/* ───────────── purchasing ───────────── */
export const suppliers = pgTable("suppliers", {
  id: pk(),
  workspaceId: ws(),
  businessId: biz(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: created(),
});

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: pk(),
    workspaceId: ws(),
    businessId: biz(),
    number: text("number").notNull(),
    supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
    status: text("status").notNull().default("ordered"), // ordered|partial|received|cancelled
    total: money("total"),
    note: text("note"),
    orderedAt: timestamp("ordered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("po_ws_number").on(t.workspaceId, t.number)],
);

export const purchaseOrderLines = pgTable(
  "purchase_order_lines",
  {
    id: pk(),
    workspaceId: ws(),
    poId: uuid("po_id").notNull().references(() => purchaseOrders.id),
    productId: uuid("product_id").notNull().references(() => products.id),
    quantity: qty("quantity"),
    receivedQty: qty("received_qty"),
    unitCost: money("unit_cost"),
  },
  (t) => [check("pol_received", sql`${t.receivedQty} <= ${t.quantity}`)],
);

export const supplierBills = pgTable(
  "supplier_bills",
  {
    id: pk(),
    workspaceId: ws(),
    businessId: biz(),
    number: text("number").notNull(),
    supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
    poId: uuid("po_id").references(() => purchaseOrders.id),
    total: money("total"),
    paid: money("paid"),
    status: text("status").notNull().default("unpaid"), // unpaid|partial|paid
    journalId: uuid("journal_id"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("bill_ws_number").on(t.workspaceId, t.number), check("bill_paid", sql`${t.paid} >= 0 AND ${t.paid} <= ${t.total}`)],
);

/* ───────────── hr / tasks / projects / assets / marketing / operations ───────────── */
export const employees = pgTable("employees", {
  id: pk(),
  workspaceId: ws(),
  businessId: biz(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  position: text("position"),
  department: text("department"),
  phone: text("phone"),
  email: text("email"),
  hireDate: date("hire_date"),
  salary: money("salary"),
  status: text("status").notNull().default("active"),
  createdAt: created(),
});

export const attendance = pgTable("attendance", {
  id: pk(),
  workspaceId: ws(),
  businessId: biz(),
  employeeId: uuid("employee_id").notNull().references(() => employees.id),
  workDate: date("work_date").notNull(),
  checkIn: text("check_in"),
  checkOut: text("check_out"),
  status: text("status").notNull().default("hadir"),
  note: text("note"),
  createdAt: created(),
});

export const tasks = pgTable("tasks", {
  id: pk(),
  workspaceId: ws(),
  businessId: biz(),
  title: text("title").notNull(),
  description: text("description"),
  priority: text("priority").notNull().default("normal"),
  status: text("status").notNull().default("todo"),
  dueDate: date("due_date"),
  assignee: text("assignee"),
  projectId: uuid("project_id"),
  createdAt: created(),
});

export const projects = pgTable("projects", {
  id: pk(),
  workspaceId: ws(),
  businessId: biz(),
  name: text("name").notNull(),
  clientId: uuid("client_id").references(() => clients.id),
  status: text("status").notNull().default("planning"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  budget: money("budget"),
  progress: integer("progress").notNull().default(0),
  notes: text("notes"),
  createdAt: created(),
});

export const assets = pgTable("assets", {
  id: pk(),
  workspaceId: ws(),
  businessId: biz(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  category: text("category"),
  location: text("location"),
  assignedTo: text("assigned_to"),
  purchaseDate: date("purchase_date"),
  cost: money("cost"),
  usefulLifeMonths: integer("useful_life_months"),
  status: text("status").notNull().default("active"),
  createdAt: created(),
});

export const campaigns = pgTable("campaigns", {
  id: pk(),
  workspaceId: ws(),
  businessId: biz(),
  name: text("name").notNull(),
  channel: text("channel"),
  budget: money("budget"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  status: text("status").notNull().default("draft"),
  notes: text("notes"),
  resultNote: text("result_note"),
  createdAt: created(),
});

export const opsLogs = pgTable("ops_logs", {
  id: pk(),
  workspaceId: ws(),
  businessId: biz(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  detail: text("detail"),
  status: text("status").notNull().default("open"),
  deviceId: uuid("device_id"),
  operator: text("operator"),
  createdAt: created(),
});

export const cashSessions = pgTable(
  "cash_sessions",
  {
    id: pk(),
    workspaceId: ws(),
    businessId: biz(),
    accountId: uuid("account_id").notNull().references(() => cashAccounts.id),
    openingAmount: money("opening_amount"),
    expectedAmount: numeric("expected_amount", { precision: 18, scale: 2 }),
    countedAmount: numeric("counted_amount", { precision: 18, scale: 2 }),
    variance: numeric("variance", { precision: 18, scale: 2 }),
    status: text("status").notNull().default("open"), // open | closed
    note: text("note"),
    openedBy: uuid("opened_by"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  // Maksimal satu sesi kas terbuka per akun kas (mencegah duplicate cash session).
  (t) => [uniqueIndex("cash_one_open").on(t.workspaceId, t.accountId).where(sql`${t.status} = 'open'`)],
);

/* ───────────── booking ───────────── */
export const bookingResources = pgTable("booking_resources", {
  id: pk(),
  workspaceId: ws(),
  businessId: biz(),
  name: text("name").notNull(),
  kind: text("kind"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: created(),
});

export const bookings = pgTable(
  "bookings",
  {
    id: pk(),
    workspaceId: ws(),
    businessId: biz(),
    resourceId: uuid("resource_id").notNull().references(() => bookingResources.id),
    clientId: uuid("client_id").references(() => clients.id),
    customerName: text("customer_name").notNull(),
    service: text("service"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("confirmed"), // confirmed|cancelled|completed
    paymentStatus: text("payment_status").notNull().default("unpaid"),
    notes: text("notes"),
    deviceId: uuid("device_id"),
    createdAt: created(),
  },
  (t) => [index("bookings_res").on(t.resourceId, t.startsAt), check("bookings_range", sql`${t.endsAt} > ${t.startsAt}`)],
);
