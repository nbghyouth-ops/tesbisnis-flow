import { describe, expect, it } from "vitest";
import { assertBalanced } from "@/server/accounting";
import { canTransition } from "@/server/routes/finance";
import { weightedAvg } from "@/server/routes/sales";
import { assertCurrencyPrecision, fromCents, groupDigits, mulQty, percentOf, toCents, toMilli } from "@/lib/money";
import { hashPin, validatePin, verifyPin } from "@/lib/crypto";
import { can } from "@/lib/permissions";
import { TEMPLATES } from "@/lib/templates";
import { toCsv } from "@/lib/client";

describe("money (tanpa floating point)", () => {
  it("parse & format sen", () => {
    expect(toCents("2500000")).toBe(250000000n);
    expect(fromCents(toCents("0.1") + toCents("0.2"))).toBe("0.30"); // 0.1 + 0.2 float = 0.30000000000000004
    expect(fromCents(-5n)).toBe("-0.05");
  });
  it("menolak input tidak valid", () => {
    expect(() => toCents("-1")).toThrow();
    expect(() => toCents("1.234")).toThrow();
    expect(() => toCents("abc")).toThrow();
    expect(() => toMilli("1.2345")).toThrow();
  });
  it("qty × harga half-up & persen", () => {
    expect(fromCents(mulQty("3", "15000"))).toBe("45000.00");
    expect(fromCents(mulQty("0.333", "100"))).toBe("33.30");
    expect(fromCents(percentOf(toCents("100000"), "11"))).toBe("11000.00");
    expect(fromCents(percentOf(toCents("1"), "11.5"))).toBe("0.12");
  });
  it("IDR tidak menerima pecahan", () => {
    expect(() => assertCurrencyPrecision("10.5", "IDR")).toThrow();
    expect(() => assertCurrencyPrecision("10.00", "IDR")).not.toThrow();
    expect(() => assertCurrencyPrecision("10.55", "USD")).not.toThrow();
  });
  it("format keypad", () => expect(groupDigits("1250000")).toBe("1.250.000"));
});

describe("jurnal double-entry", () => {
  it("jurnal seimbang diterima (income)", () => {
    expect(assertBalanced([{ accountId: "a", debit: "2500000" }, { accountId: "b", credit: "2500000" }])).toBe("2500000.00");
  });
  it("menolak tidak seimbang, nol, baris ganda sisi, dan <2 baris", () => {
    expect(() => assertBalanced([{ accountId: "a", debit: "10" }, { accountId: "b", credit: "9" }])).toThrow();
    expect(() => assertBalanced([{ accountId: "a", debit: "0" }, { accountId: "b", credit: "0" }])).toThrow();
    expect(() => assertBalanced([{ accountId: "a", debit: "5", credit: "5" }, { accountId: "b", credit: "0", debit: "0" }])).toThrow();
    expect(() => assertBalanced([{ accountId: "a", debit: "5" }])).toThrow();
  });
  it("jurnal penjualan multi-baris seimbang (kas + piutang = pendapatan + pajak; HPP = persediaan)", () => {
    expect(() => assertBalanced([
      { accountId: "kas", debit: "50000" }, { accountId: "ar", debit: "61000" }, { accountId: "rev", credit: "100000" }, { accountId: "tax", credit: "11000" },
      { accountId: "hpp", debit: "40000" }, { accountId: "inv", credit: "40000" },
    ])).not.toThrow();
  });
});

describe("state machine transaksi", () => {
  it("transisi sah & tidak sah", () => {
    expect(canTransition("draft", "posted")).toBe(true);
    expect(canTransition("draft", "pending_approval")).toBe(true);
    expect(canTransition("pending_approval", "approved")).toBe(true);
    expect(canTransition("approved", "posted")).toBe(true);
    expect(canTransition("posted", "reversed")).toBe(true);
    expect(canTransition("posted", "draft")).toBe(false);
    expect(canTransition("reversed", "posted")).toBe(false);
    expect(canTransition("rejected", "posted")).toBe(false);
    expect(canTransition("draft", "reversed")).toBe(false);
  });
});

describe("biaya rata-rata bergerak", () => {
  it("stok kosong memakai biaya masuk", () => expect(weightedAvg(0n, 0n, 10000n, 900000n)).toBe(900000n));
  it("menghitung ulang rata-rata", () => {
    // 10 @ 9.000 + 10 @ 11.000 => 10.000
    expect(weightedAvg(10000n, 900000n, 10000n, 1100000n)).toBe(1000000n);
  });
});

describe("PIN", () => {
  it("validasi", () => {
    expect(validatePin("4827")).toBeNull();
    expect(validatePin("482715")).toBeNull();
    for (const bad of ["123", "1234567", "abcd", "1111", "1234", "4321", "123456", "121212", "1212", "", 1234 as unknown as string]) expect(validatePin(bad)).not.toBeNull();
  });
  it("hash Argon2id dengan salt unik, tidak plaintext", async () => {
    const a = await hashPin("4827"), b = await hashPin("4827");
    expect(a.startsWith("$argon2id$")).toBe(true);
    expect(a).not.toBe(b);
    expect(a).not.toContain("4827");
    expect(await verifyPin(a, "4827")).toBe(true);
    expect(await verifyPin(a, "4828")).toBe(false);
  });
});

describe("izin per peran", () => {
  it("owner semua; kasir tidak keuangan; viewer tidak menulis", () => {
    expect(can("owner", "devices:manage")).toBe(true);
    expect(can("cashier", "sales:write")).toBe(true);
    expect(can("cashier", "finance:read")).toBe(false);
    expect(can("cashier", "devices:manage")).toBe(false);
    expect(can("viewer", "finance:read")).toBe(true);
    expect(can("viewer", "finance:write")).toBe(false);
    expect(can("manager", "devices:manage")).toBe(false);
    expect(can("manager", "finance:approve")).toBe(true);
    expect(can("unknown", "crm:read")).toBe(false);
  });
});

describe("template & CSV", () => {
  it("16 template unik", () => {
    expect(TEMPLATES).toHaveLength(16);
    expect(new Set(TEMPLATES.map((t) => t.key)).size).toBe(16);
  });
  it("CSV melindungi formula injection", () => {
    const csv = toCsv([{ key: "n", label: "Nama" }, { key: "v", label: "Nilai" }], [{ n: "=HYPERLINK(\"x\")", v: "-1500.00" }, { n: "@cmd", v: "a,b" }]);
    expect(csv).toContain("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csv).toContain("'@cmd");
    expect(csv).toContain("-1500.00");
    expect(csv).toContain("\"a,b\"");
  });
});
