/** Aritmetika uang tanpa floating point. Nilai disimpan NUMERIC(18,2); internal = sen (BigInt). */
export const CURRENCY_DECIMALS: Record<string, number> = { IDR: 0, JPY: 0, USD: 2, EUR: 2, SGD: 2, MYR: 2 };
export class MoneyError extends Error {}
export const decimalsOf = (currency: string) => CURRENCY_DECIMALS[currency] ?? 2;

const MONEY_RE = /^\d{1,15}(\.\d{1,2})?$/;
const QTY_RE = /^\d{1,15}(\.\d{1,3})?$/;

export function toCents(input: string | number): bigint {
  const s = typeof input === "number" ? String(input) : input.trim();
  if (!MONEY_RE.test(s)) throw new MoneyError(`Nominal tidak valid: ${s}`);
  const [i, f = ""] = s.split(".");
  return BigInt(i) * 100n + BigInt(f.padEnd(2, "0"));
}

export function fromCents(c: bigint): string {
  const neg = c < 0n;
  const a = neg ? -c : c;
  const s = `${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`;
  return neg ? `-${s}` : s;
}

/** Parse kuantitas (maks 3 desimal) ke satuan milli. */
export function toMilli(input: string | number): bigint {
  const s = typeof input === "number" ? String(input) : input.trim();
  if (!QTY_RE.test(s)) throw new MoneyError(`Kuantitas tidak valid: ${s}`);
  const [i, f = ""] = s.split(".");
  return BigInt(i) * 1000n + BigInt(f.padEnd(3, "0"));
}

export function fromMilli(m: bigint): string {
  const neg = m < 0n;
  const a = neg ? -m : m;
  const s = `${a / 1000n}.${(a % 1000n).toString().padStart(3, "0")}`;
  return neg ? `-${s}` : s;
}

/** qty × harga satuan, pembulatan half-up ke sen. */
export function mulQty(qty: string, unit: string): bigint {
  return (toMilli(qty) * toCents(unit) + 500n) / 1000n;
}

/** persen (mis. "11" atau "11.5") dari nilai sen, half-up. */
export function percentOf(cents: bigint, percent: string): bigint {
  const p = BigInt(Math.round(Number(percent) * 100)); // basis point
  return (cents * p + 5000n) / 10000n;
}

/** Validasi presisi sesuai mata uang (IDR tidak boleh pecahan). */
export function assertCurrencyPrecision(value: string, currency: string) {
  const d = decimalsOf(currency);
  const frac = value.split(".")[1] ?? "";
  if (frac.length > d && /[1-9]/.test(frac.slice(d))) {
    throw new MoneyError(`Mata uang ${currency} hanya mendukung ${d} desimal.`);
  }
}

export function formatMoney(value: string | number | null | undefined, currency = "IDR"): string {
  const d = decimalsOf(currency);
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(Number.isFinite(n) ? n : 0);
}

/** Format input keypad: "1250000" -> "1.250.000". */
export function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
