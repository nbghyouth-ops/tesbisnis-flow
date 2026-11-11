// Integration smoke test terhadap server yang berjalan (BASE_URL, default http://localhost:3111).
// Hanya memakai database LOKAL yang dikonfigurasi server. Tidak menyentuh Neon production.
const BASE = process.env.BASE_URL || "http://localhost:3111";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("PASS", m); } else { fail++; console.log("FAIL", m); } };

class Client {
  constructor() { this.cookie = ""; this.tab = null; }
  async call(method, path, body, extra = {}) {
    const headers = { "x-requested-with": "bf", "content-type": "application/json", ...extra };
    if (this.cookie) headers.cookie = this.cookie;
    if (this.tab && !extra["x-tab-session"] && extra["x-tab-session"] !== null) headers["x-tab-session"] = this.tab;
    const res = await fetch(BASE + "/api/v1" + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.get("set-cookie");
    if (sc) this.cookie = sc.split(";")[0];
    let data = null; try { data = await res.json(); } catch {}
    return { status: res.status, data };
  }
}

const owner = new Client();
const draft = {
  needs: ["finance", "pos"], problems: [], solutions: [], templateKey: "retail", businessModel: "B2C",
  name: "Toko Uji Coba " + Date.now(), ownerName: "Pemilik Uji", deviceName: "Laptop Uji",
  timezone: "Asia/Jakarta", language: "id", dateFormat: "DD/MM/YYYY", currency: "IDR",
  cashAccounts: [{ name: "Kas Utama", kind: "cash", openingBalance: "1000000" }, { name: "Bank BCA", kind: "bank", openingBalance: "" }],
  incomeCategories: ["Pendapatan Penjualan", "Pendapatan Lain"], expenseCategories: ["Beban Operasional", "Beban Sewa"],
  fiscalStartMonth: 1, mainBranchName: "Pusat", extraBranches: [], modules: [], mode: "simple", acceptTerms: true, acceptPrivacy: true,
};

// ── Onboarding & PIN
let r = await owner.call("POST", "/onboarding/pin", { pin: "1234", confirm: "1234" });
ok(r.status === 422, "PIN lemah (1234) ditolak");
r = await owner.call("POST", "/onboarding/pin", { pin: "4827", confirm: "4828" });
ok(r.status === 422, "Konfirmasi PIN tidak sama ditolak");
r = await owner.call("POST", "/onboarding/pin", { pin: "4827", confirm: "4827" });
ok(r.status === 200 || r.status === 201, "PIN valid dibuat (cookie device diterbitkan)");
ok(owner.cookie.startsWith("bf_device="), "Cookie device diterima");
r = await owner.call("POST", "/onboarding/draft", { step: 3, data: { name: "x" } });
ok(r.status === 200 || r.status === 201, "Draft onboarding tersimpan");
r = await owner.call("GET", "/onboarding/draft");
ok(r.data?.step === 3, "Draft dapat dilanjutkan");
r = await owner.call("POST", "/onboarding/complete", { ...draft, acceptTerms: false });
ok(r.status === 422, "Onboarding tanpa persetujuan syarat ditolak");
r = await owner.call("POST", "/onboarding/complete", draft);
ok(r.status === 201 || r.status === 200, "Workspace dibuat: " + JSON.stringify(r.data).slice(0, 80));

// ── Lock / unlock
r = await owner.call("GET", "/dashboard");
ok(r.status === 401 && r.data?.code === "locked", "API menolak tanpa sesi tab (terkunci)");
r = await owner.call("POST", "/device/unlock", { pin: "0000" });
ok(r.status === 401, "PIN salah ditolak");
r = await owner.call("POST", "/device/unlock", { pin: "4827" });
ok(r.status === 200 && r.data.tab, "Unlock berhasil");
owner.tab = r.data.tab;
const tabA = owner.tab;
r = await owner.call("POST", "/device/unlock", { pin: "4827" });
const tabB = r.data.tab;
await owner.call("POST", "/device/lock", null, { "x-tab-session": tabA });
r = await owner.call("GET", "/dashboard", null, { "x-tab-session": tabA });
ok(r.status === 401, "Tab A terkunci setelah lock; sesi dicabut di server");
r = await owner.call("GET", "/dashboard", null, { "x-tab-session": tabB });
ok(r.status === 200, "Tab B tetap punya sesi sendiri (isolasi per-tab)");
owner.tab = tabB;
r = await owner.call("POST", "/device/unlock", { pin: "1234" }, { "x-requested-with": "other" });
ok(r.status === 403, "CSRF: header x-requested-with salah ditolak");

// ── Keuangan
const accs = (await owner.call("GET", "/finance/cash-accounts")).data.items;
const kas = accs.find((a) => a.name === "Kas Utama"), bank = accs.find((a) => a.name === "Bank BCA");
ok(kas.balance === "1000000.00", "Saldo awal Kas Utama dari jurnal = 1.000.000");
const cats = (await owner.call("GET", "/finance/categories")).data.items;
const inc = cats.find((c) => c.kind === "income"), exp = cats.find((c) => c.kind === "expense");
const idem = "idem-" + Date.now();
const t1 = await owner.call("POST", "/finance/transactions", { type: "income", amount: "2500000", categoryId: inc.id, accountId: kas.id }, { "idempotency-key": idem });
const t1b = await owner.call("POST", "/finance/transactions", { type: "income", amount: "2500000", categoryId: inc.id, accountId: kas.id }, { "idempotency-key": idem });
ok(t1.status === 201 && t1b.data.id === t1.data.id, "Idempotency: retry tidak membuat transaksi ganda");
const t2 = await owner.call("POST", "/finance/transactions", { type: "expense", amount: "350000", categoryId: exp.id, accountId: kas.id });
ok(t2.data.state === "posted", "Expense diposting");
r = await owner.call("POST", "/finance/transactions", { type: "transfer", amount: "1000000", accountId: kas.id, toAccountId: kas.id });
ok(r.status === 422, "Transfer akun sama ditolak");
r = await owner.call("POST", "/finance/transactions", { type: "transfer", amount: "1000000", accountId: kas.id, toAccountId: bank.id });
ok(r.status === 201, "Transfer Kas→Bank");
r = await owner.call("POST", "/finance/transactions", { type: "income", amount: "0", categoryId: inc.id, accountId: kas.id });
ok(r.status === 422, "Nominal nol ditolak");
r = await owner.call("POST", "/finance/transactions", { type: "income", amount: "10.5", categoryId: inc.id, accountId: kas.id });
ok(r.status === 422, "IDR tidak menerima pecahan");
r = await owner.call("POST", "/finance/transactions", { type: "income", amount: "100", categoryId: exp.id, accountId: kas.id });
ok(r.status === 422, "Kategori expense untuk income ditolak");
let accs2 = (await owner.call("GET", "/finance/cash-accounts")).data.items;
ok(accs2.find((a) => a.name === "Kas Utama").balance === "2150000.00", "Kas = 1.000.000 + 2.500.000 - 350.000 - 1.000.000 = 2.150.000: " + accs2.find((a) => a.name === "Kas Utama").balance);
ok(accs2.find((a) => a.name === "Bank BCA").balance === "1000000.00", "Bank = 1.000.000 dari transfer");
r = await owner.call("POST", `/finance/transactions/${t2.data.id}/reverse`, { reason: "Salah input" });
ok(r.status === 201 || r.status === 200, "Reversal expense");
r = await owner.call("POST", `/finance/transactions/${t2.data.id}/reverse`, { reason: "Ulang" });
ok(r.status === 409, "Reversal ganda ditolak (state machine)");

// ── Laporan
const tb = await owner.call("GET", "/reports/trial-balance");
const last = tb.data.rows.at(-1);
ok(last.debit === last.credit, "Neraca saldo seimbang: " + last.debit + " = " + last.credit);
const bs = await owner.call("GET", "/reports/balance-sheet");
ok(bs.data.rows.at(-1).name === "Seimbang", "Neraca (balance sheet) seimbang");
const pl = await owner.call("GET", "/reports/profit-loss");
ok(pl.data.rows.at(-1).amount === "2500000.00", "Laba bersih = 2.500.000 (transfer bukan pendapatan; expense dibalik)");

// ── Produk, stok, penjualan
const p = await owner.call("POST", "/r/products", { sku: "SKU-1", name: "Kopi", kind: "product", price: "15000", trackStock: true, unit: "pcs" });
ok(p.status === 201, "Produk dibuat");
const pid = p.data.item.id;
r = await owner.call("POST", "/r/products", { sku: "SKU-1", name: "Dup", price: "1" });
ok(r.status === 409, "SKU duplikat ditolak");
r = await owner.call("POST", "/inventory/adjust", { productId: pid, direction: "in", quantity: "10", reason: "opening", unitCost: "9000" });
ok(r.status === 201, "Stok awal 10 @9.000");
r = await owner.call("POST", "/sales/checkout", { lines: [{ productId: pid, quantity: "11" }], payments: [{ accountId: kas.id, amount: "165000" }] });
ok(r.status === 409 && r.data.code === "insufficient_stock", "Stok tidak cukup ditolak");
// 5 checkout bersamaan masing-masing 3 → hanya 3 yang boleh berhasil (stok 10)
const results = await Promise.all(Array.from({ length: 5 }, () => owner.call("POST", "/sales/checkout", { lines: [{ productId: pid, quantity: "3" }], payments: [{ accountId: kas.id, amount: "45000" }] })));
const succ = results.filter((x) => x.status === 201).length;
ok(succ === 3, `Checkout bersamaan: ${succ} berhasil dari 5 (stok 10, @3) → tepat 3`);
const stock = (await owner.call("GET", "/inventory/stock")).data.items.find((x) => x.id === pid);
ok(stock.onHand === "1.000", "Stok akhir = 1 (tidak negatif): " + stock.onHand);
const cl = await owner.call("POST", "/r/clients", { type: "organization", name: "PT Uji", phone: "0812-3456" });
const cid = cl.data.item.id;
ok(cl.data.item.code.startsWith("CLI-"), "Kode klien otomatis " + cl.data.item.code);
r = await owner.call("POST", "/sales/checkout", { clientId: cid, channel: "invoice", lines: [{ productId: pid, quantity: "1" }], payments: [] });
ok(r.status === 201 && r.data.status === "unpaid", "Faktur kredit → piutang");
const invId = r.data.id;
r = await owner.call("POST", `/sales/invoices/${invId}/payments`, { accountId: bank.id, amount: "20000" });
ok(r.status === 422, "Pembayaran melebihi sisa ditolak");
r = await owner.call("POST", `/sales/invoices/${invId}/payments`, { accountId: bank.id, amount: "15000" });
ok(r.status === 201, "Pelunasan piutang");
const ar = (await owner.call("GET", "/finance/receivables")).data.items;
ok(ar.length === 0, "Piutang nol setelah pelunasan");
r = await owner.call("GET", `/crm/clients/${cid}`);
ok(r.data.financial.billed === "15000.00" && r.data.financial.outstanding === "0.00", "Ringkasan keuangan klien benar");
const tb2 = (await owner.call("GET", "/reports/trial-balance")).data.rows.at(-1);
ok(tb2.debit === tb2.credit, "Neraca saldo tetap seimbang setelah penjualan");

// ── Pembelian
const sup = await owner.call("POST", "/r/suppliers", { name: "Supplier A" });
const po = await owner.call("POST", "/purchasing/orders", { supplierId: sup.data.item.id, lines: [{ productId: pid, quantity: "20", unitCost: "10000" }] });
ok(po.status === 201, "PO dibuat");
const pol = (await owner.call("GET", "/purchasing/orders")).data.items[0].lines[0];
r = await owner.call("POST", `/purchasing/orders/${po.data.id}/receive`, { lines: [{ lineId: pol.id, quantity: "30" }] });
ok(r.status === 422, "Penerimaan melebihi pesanan ditolak");
r = await owner.call("POST", `/purchasing/orders/${po.data.id}/receive`, { lines: [{ lineId: pol.id, quantity: "10" }] });
ok(r.data.status === "partial", "Penerimaan parsial");
const ap = (await owner.call("GET", "/finance/payables")).data.items;
ok(ap.length === 1 && ap[0].outstanding === "100000.00", "Utang usaha 100.000");
r = await owner.call("POST", `/purchasing/bills/${ap[0].id}/payments`, { accountId: bank.id, amount: "100000" });
ok(r.status === 201, "Bayar tagihan supplier mengurangi utang");
const st2 = (await owner.call("GET", "/inventory/stock")).data.items.find((x) => x.id === pid);
ok(st2.onHand === "10.000", "Stok 0 + 10 diterima = 10");
const tb3 = (await owner.call("GET", "/reports/trial-balance")).data.rows.at(-1);
ok(tb3.debit === tb3.credit, "Neraca saldo seimbang setelah pembelian");

// ── Booking: double booking
const res = await owner.call("POST", "/r/booking-resources", { name: "Meja 1" });
const rid = res.data.item.id;
const slot = { resourceId: rid, customerName: "Budi", startsAt: "2030-01-01T10:00:00Z", endsAt: "2030-01-01T11:00:00Z" };
const bk = await Promise.all(Array.from({ length: 4 }, () => owner.call("POST", "/bookings", slot)));
ok(bk.filter((x) => x.status === 201).length === 1, "Booking bersamaan slot sama: tepat 1 berhasil");
r = await owner.call("POST", "/bookings", { ...slot, startsAt: "2030-01-01T10:30:00Z", endsAt: "2030-01-01T11:30:00Z" });
ok(r.status === 409, "Slot overlap ditolak");

// ── Kas
r = await owner.call("POST", "/cash/open", { accountId: kas.id, openingAmount: "100000" });
ok(r.status === 201, "Buka sesi kas");
r = await owner.call("POST", "/cash/open", { accountId: kas.id, openingAmount: "100000" });
ok(r.status === 409, "Sesi kas ganda ditolak");

// ── Pairing & revoke & RBAC
r = await owner.call("POST", "/devices/pairing", { role: "cashier" });
ok(r.status === 201 && /^[A-Z2-9]{8}$/.test(r.data.code), "Kode pairing dibuat");
const code = r.data.code;
const cashier = new Client();
r = await cashier.call("POST", "/device/pair", { code: "ZZZZZZZZ", pin: "7391", confirm: "7391" });
ok(r.status === 422, "Kode pairing salah ditolak");
r = await cashier.call("POST", "/device/pair", { code, pin: "7391", confirm: "7391", deviceName: "Tablet Kasir" });
ok(r.status === 201, "Perangkat baru terhubung");
r = await new Client().call("POST", "/device/pair", { code, pin: "7391", confirm: "7391" });
ok(r.status === 422, "Kode pairing sekali pakai");
r = await cashier.call("POST", "/device/unlock", { pin: "7391" });
cashier.tab = r.data.tab;
r = await cashier.call("GET", "/finance/transactions");
ok(r.status === 403, "Kasir tidak punya izin keuangan (RBAC di server)");
r = await cashier.call("GET", "/sales/pos-meta");
ok(r.status === 200, "Kasir dapat memakai POS");
r = await cashier.call("POST", "/devices/pairing", { role: "viewer" });
ok(r.status === 403, "Kasir tidak dapat mengelola perangkat");
const devs = (await owner.call("GET", "/devices")).data.items;
const cdev = devs.find((d) => d.name === "Tablet Kasir");
r = await owner.call("POST", `/devices/${cdev.id}/revoke`);
ok(r.status === 201, "Perangkat kasir dicabut");
r = await cashier.call("GET", "/sales/pos-meta");
ok(r.status === 401, "Sesi perangkat dicabut langsung ditolak");
const self = devs.find((d) => d.role === "owner");
r = await owner.call("POST", `/devices/${self.id}/revoke`);
ok(r.status === 409, "Tidak boleh mencabut satu-satunya owner");

// ── Ubah PIN tanpa PIN lama
r = await owner.call("POST", "/device/change-pin", { pin: "9152", confirm: "9152" });
ok(r.status === 200 && r.data.tab, "Ubah PIN tanpa PIN lama → langsung dapat sesi");
const oldTab = owner.tab; owner.tab = r.data.tab;
r = await owner.call("GET", "/dashboard", null, { "x-tab-session": oldTab });
ok(r.status === 401, "Sesi tab lama dicabut setelah ubah PIN");
r = await owner.call("POST", "/device/unlock", { pin: "4827" });
ok(r.status === 401, "PIN lama tidak berlaku");
r = await owner.call("POST", "/device/unlock", { pin: "9152" });
ok(r.status === 200, "PIN baru berlaku");
// brute force lock
const brute = new Client(); brute.cookie = owner.cookie;
for (let i = 0; i < 5; i++) await brute.call("POST", "/device/unlock", { pin: "0001" });
r = await brute.call("POST", "/device/unlock", { pin: "9152" });
ok(r.status === 429, "Brute-force PIN: perangkat dikunci sementara setelah 5 gagal");

console.log(`\nHASIL: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
