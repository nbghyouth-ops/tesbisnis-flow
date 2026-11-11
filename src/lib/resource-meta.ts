import type { Module } from "./permissions";

export type FieldType = "text" | "textarea" | "int" | "qty" | "money" | "date" | "time" | "select" | "bool" | "ref";
export type Opt = { value: string; label: string };
export type Field = {
  name: string; label: string; type: FieldType; required?: boolean; options?: Opt[];
  ref?: string; hideInTable?: boolean; def?: string | boolean; help?: string;
};
export type ResourceMeta = {
  key: string; label: string; perm: Module; titleField: string; fields: Field[];
  auto?: { col: string; prefix: string };
  archive?: { col: string; value: string | boolean; label: string };
  remove?: boolean; noEdit?: boolean;
};

const o = (...v: string[]): Opt[] => v.map((x) => ({ value: x, label: x.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) }));

export const RESOURCES: Record<string, ResourceMeta> = {
  clients: {
    key: "clients", label: "Klien", perm: "crm", titleField: "name", auto: { col: "code", prefix: "CLI" },
    archive: { col: "status", value: "archived", label: "Arsipkan" },
    fields: [
      { name: "type", label: "Tipe", type: "select", options: [{ value: "individual", label: "Perorangan" }, { value: "organization", label: "Organisasi" }], def: "individual" },
      { name: "name", label: "Nama", type: "text", required: true },
      { name: "legalName", label: "Nama badan hukum", type: "text", hideInTable: true },
      { name: "phone", label: "Telepon", type: "text" },
      { name: "email", label: "Email (opsional)", type: "text", hideInTable: true },
      { name: "address", label: "Alamat", type: "textarea" },
      { name: "industry", label: "Industri", type: "text", hideInTable: true },
      { name: "status", label: "Status", type: "select", options: o("active", "inactive", "archived", "restricted"), def: "active" },
      { name: "source", label: "Sumber", type: "text", hideInTable: true },
      { name: "notes", label: "Catatan", type: "textarea" },
    ],
  },
  "client-contacts": {
    key: "client-contacts", label: "Kontak", perm: "crm", titleField: "name", remove: true,
    fields: [
      { name: "clientId", label: "Klien", type: "ref", ref: "clients", required: true, hideInTable: true },
      { name: "name", label: "Nama kontak", type: "text", required: true },
      { name: "title", label: "Jabatan", type: "text" },
      { name: "phone", label: "Telepon", type: "text" },
      { name: "email", label: "Email (opsional)", type: "text" },
    ],
  },
  "client-activities": {
    key: "client-activities", label: "Aktivitas", perm: "crm", titleField: "summary", noEdit: true,
    fields: [
      { name: "clientId", label: "Klien", type: "ref", ref: "clients", required: true, hideInTable: true },
      { name: "kind", label: "Jenis", type: "select", options: o("note", "call", "meeting", "visit", "consultation", "follow_up", "contract"), def: "note" },
      { name: "summary", label: "Ringkasan", type: "textarea", required: true },
      { name: "isInternal", label: "Catatan internal (dibatasi izin)", type: "bool", def: false },
    ],
  },
  products: {
    key: "products", label: "Produk & Layanan", perm: "inventory", titleField: "name",
    archive: { col: "isActive", value: false, label: "Nonaktifkan" },
    fields: [
      { name: "sku", label: "SKU", type: "text", required: true },
      { name: "barcode", label: "Barcode", type: "text", hideInTable: true },
      { name: "name", label: "Nama", type: "text", required: true },
      { name: "kind", label: "Jenis", type: "select", options: [{ value: "product", label: "Produk" }, { value: "service", label: "Layanan" }], def: "product" },
      { name: "category", label: "Kategori", type: "text" },
      { name: "unit", label: "Satuan", type: "text", def: "pcs", hideInTable: true },
      { name: "price", label: "Harga jual", type: "money", required: true },
      { name: "trackStock", label: "Lacak stok", type: "bool", def: true, help: "Nonaktifkan untuk layanan." },
      { name: "reorderLevel", label: "Batas reorder", type: "qty", hideInTable: true },
      { name: "isActive", label: "Aktif", type: "bool", def: true, hideInTable: true },
    ],
  },
  suppliers: {
    key: "suppliers", label: "Supplier", perm: "purchasing", titleField: "name",
    archive: { col: "isActive", value: false, label: "Nonaktifkan" },
    fields: [
      { name: "name", label: "Nama supplier", type: "text", required: true },
      { name: "phone", label: "Telepon", type: "text" },
      { name: "email", label: "Email (opsional)", type: "text", hideInTable: true },
      { name: "address", label: "Alamat", type: "textarea" },
      { name: "notes", label: "Catatan", type: "textarea", hideInTable: true },
      { name: "isActive", label: "Aktif", type: "bool", def: true, hideInTable: true },
    ],
  },
  employees: {
    key: "employees", label: "Karyawan", perm: "hr", titleField: "name", auto: { col: "code", prefix: "EMP" },
    archive: { col: "status", value: "inactive", label: "Nonaktifkan" },
    fields: [
      { name: "name", label: "Nama", type: "text", required: true },
      { name: "position", label: "Jabatan", type: "text" },
      { name: "department", label: "Departemen", type: "text" },
      { name: "phone", label: "Telepon", type: "text" },
      { name: "email", label: "Email (opsional)", type: "text", hideInTable: true },
      { name: "hireDate", label: "Tanggal masuk", type: "date", hideInTable: true },
      { name: "salary", label: "Gaji pokok", type: "money", hideInTable: true },
      { name: "status", label: "Status", type: "select", options: o("active", "inactive"), def: "active" },
    ],
  },
  attendance: {
    key: "attendance", label: "Absensi", perm: "hr", titleField: "workDate", remove: true,
    fields: [
      { name: "employeeId", label: "Karyawan", type: "ref", ref: "employees", required: true },
      { name: "workDate", label: "Tanggal", type: "date", required: true },
      { name: "checkIn", label: "Masuk", type: "time" },
      { name: "checkOut", label: "Pulang", type: "time" },
      { name: "status", label: "Status", type: "select", options: o("hadir", "izin", "sakit", "cuti", "alpa"), def: "hadir" },
      { name: "note", label: "Catatan", type: "text", hideInTable: true },
    ],
  },
  tasks: {
    key: "tasks", label: "Tugas", perm: "tasks", titleField: "title", remove: true,
    fields: [
      { name: "title", label: "Judul", type: "text", required: true },
      { name: "description", label: "Deskripsi", type: "textarea", hideInTable: true },
      { name: "priority", label: "Prioritas", type: "select", options: o("low", "normal", "high", "urgent"), def: "normal" },
      { name: "status", label: "Status", type: "select", options: o("todo", "in_progress", "blocked", "done"), def: "todo" },
      { name: "dueDate", label: "Tenggat", type: "date" },
      { name: "assignee", label: "Penanggung jawab", type: "text" },
      { name: "projectId", label: "Proyek", type: "ref", ref: "projects", hideInTable: true },
    ],
  },
  projects: {
    key: "projects", label: "Proyek", perm: "projects", titleField: "name",
    archive: { col: "status", value: "cancelled", label: "Batalkan" },
    fields: [
      { name: "name", label: "Nama proyek", type: "text", required: true },
      { name: "clientId", label: "Klien", type: "ref", ref: "clients", hideInTable: true },
      { name: "status", label: "Status", type: "select", options: o("planning", "active", "on_hold", "completed", "cancelled"), def: "planning" },
      { name: "startDate", label: "Mulai", type: "date" },
      { name: "endDate", label: "Selesai", type: "date" },
      { name: "budget", label: "Anggaran", type: "money" },
      { name: "progress", label: "Progres (%)", type: "int" },
      { name: "notes", label: "Catatan", type: "textarea", hideInTable: true },
    ],
  },
  assets: {
    key: "assets", label: "Aset", perm: "assets", titleField: "name", auto: { col: "code", prefix: "AST" },
    archive: { col: "status", value: "retired", label: "Pensiunkan" },
    fields: [
      { name: "name", label: "Nama aset", type: "text", required: true },
      { name: "category", label: "Kategori", type: "text" },
      { name: "location", label: "Lokasi", type: "text" },
      { name: "assignedTo", label: "Dipegang oleh", type: "text" },
      { name: "purchaseDate", label: "Tanggal beli", type: "date", hideInTable: true },
      { name: "cost", label: "Harga perolehan", type: "money" },
      { name: "usefulLifeMonths", label: "Umur manfaat (bulan)", type: "int", hideInTable: true },
      { name: "status", label: "Status", type: "select", options: o("active", "maintenance", "retired"), def: "active" },
    ],
  },
  campaigns: {
    key: "campaigns", label: "Kampanye", perm: "marketing", titleField: "name", remove: true,
    fields: [
      { name: "name", label: "Nama kampanye", type: "text", required: true },
      { name: "channel", label: "Kanal", type: "text" },
      { name: "budget", label: "Anggaran", type: "money" },
      { name: "startDate", label: "Mulai", type: "date" },
      { name: "endDate", label: "Selesai", type: "date" },
      { name: "status", label: "Status", type: "select", options: o("draft", "running", "completed", "cancelled"), def: "draft" },
      { name: "notes", label: "Aktivitas/catatan", type: "textarea", hideInTable: true },
      { name: "resultNote", label: "Hasil (catatan manual)", type: "textarea", hideInTable: true, help: "Dicatat manual; sistem tidak menghitung konversi/ROI." },
    ],
  },
  "ops-logs": {
    key: "ops-logs", label: "Catatan Operasional", perm: "ops", titleField: "title",
    fields: [
      { name: "kind", label: "Jenis", type: "select", options: [
        { value: "opening_checklist", label: "Checklist pembukaan" }, { value: "closing_checklist", label: "Checklist penutupan" },
        { value: "sop", label: "SOP" }, { value: "handover", label: "Serah terima shift" }, { value: "qc", label: "Kontrol kualitas" },
        { value: "incident", label: "Laporan insiden" }, { value: "log", label: "Log operasional" }], def: "log" },
      { name: "title", label: "Judul", type: "text", required: true },
      { name: "detail", label: "Detail", type: "textarea" },
      { name: "status", label: "Status", type: "select", options: o("open", "done"), def: "open" },
    ],
  },
  "booking-resources": {
    key: "booking-resources", label: "Sumber Daya Booking", perm: "booking", titleField: "name",
    archive: { col: "isActive", value: false, label: "Nonaktifkan" },
    fields: [
      { name: "name", label: "Nama (meja/kamar/kursi/kendaraan)", type: "text", required: true },
      { name: "kind", label: "Jenis", type: "text" },
      { name: "isActive", label: "Aktif", type: "bool", def: true },
    ],
  },
};
