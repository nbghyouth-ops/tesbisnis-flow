import { and, eq, lte, gte, sql } from "drizzle-orm";
import { accountingPeriods, coaAccounts, journalEntries, journalLines } from "@/db/schema";
import { fromCents, toCents } from "@/lib/money";
import { HttpError, nextNumber, type Ctx, type DB, type Tx } from "./core";

export const DEFAULT_COA: { code: string; name: string; type: string; subtype?: string }[] = [
  { code: "1201", name: "Piutang Usaha", type: "asset", subtype: "receivable" },
  { code: "1301", name: "Persediaan", type: "asset", subtype: "inventory" },
  { code: "2101", name: "Utang Usaha", type: "liability", subtype: "payable" },
  { code: "2201", name: "Utang Pajak (PPN Keluaran)", type: "liability", subtype: "tax" },
  { code: "3101", name: "Modal Pemilik", type: "equity" },
  { code: "3201", name: "Ekuitas Saldo Awal", type: "equity", subtype: "opening" },
  { code: "4101", name: "Pendapatan Penjualan", type: "revenue" },
  { code: "4102", name: "Pendapatan Jasa", type: "revenue" },
  { code: "4103", name: "Pendapatan Lain", type: "revenue" },
  { code: "5101", name: "Harga Pokok Penjualan", type: "expense", subtype: "cogs" },
  { code: "5201", name: "Selisih Persediaan", type: "expense", subtype: "variance" },
  { code: "6101", name: "Beban Operasional", type: "expense" },
  { code: "6102", name: "Beban Gaji", type: "expense" },
  { code: "6103", name: "Beban Sewa", type: "expense" },
  { code: "6104", name: "Beban Utilitas", type: "expense" },
  { code: "6105", name: "Beban Pemasaran", type: "expense" },
  { code: "6106", name: "Beban Lain", type: "expense" },
  { code: "6107", name: "Bahan Baku", type: "expense" },
];

export async function accountBySubtype(d: DB, workspaceId: string, subtype: string): Promise<string> {
  const [a] = await d.select({ id: coaAccounts.id }).from(coaAccounts).where(and(eq(coaAccounts.workspaceId, workspaceId), eq(coaAccounts.subtype, subtype), eq(coaAccounts.isActive, true))).limit(1);
  if (!a) throw new HttpError(422, `Akun sistem (${subtype}) belum tersedia di Bagan Akun.`, "coa_missing");
  return a.id;
}

export async function assertPeriodOpen(d: DB, workspaceId: string, date: string) {
  const [p] = await d
    .select({ id: accountingPeriods.id })
    .from(accountingPeriods)
    .where(and(eq(accountingPeriods.workspaceId, workspaceId), eq(accountingPeriods.status, "closed"), lte(accountingPeriods.startDate, date), gte(accountingPeriods.endDate, date)))
    .limit(1);
  if (p) throw new HttpError(409, "Periode akuntansi untuk tanggal ini sudah ditutup.", "period_locked");
}

export type JLine = { accountId: string; debit?: string; credit?: string; memo?: string };

/** Validasi jurnal seimbang (debit = kredit) dengan aritmetika BigInt. Dipakai juga oleh unit test. */
export function assertBalanced(lines: JLine[]) {
  if (lines.length < 2) throw new HttpError(422, "Jurnal minimal dua baris.", "journal_invalid");
  let d = 0n, c = 0n;
  for (const l of lines) {
    const dd = toCents(l.debit ?? "0"), cc = toCents(l.credit ?? "0");
    if ((dd > 0n && cc > 0n) || (dd === 0n && cc === 0n)) throw new HttpError(422, "Setiap baris jurnal harus debit atau kredit saja.", "journal_invalid");
    d += dd; c += cc;
  }
  if (d !== c || d === 0n) throw new HttpError(422, "Jurnal tidak seimbang.", "journal_unbalanced");
  return fromCents(d);
}

export async function postJournal(
  tx: Tx, ctx: Ctx,
  p: { date: string; memo: string; source: string; sourceId?: string; lines: JLine[]; reverses?: string },
): Promise<string> {
  assertBalanced(p.lines);
  await assertPeriodOpen(tx, ctx.workspaceId, p.date);
  const number = await nextNumber(tx, ctx.workspaceId, "journal", "JE");
  const [je] = await tx
    .insert(journalEntries)
    .values({
      workspaceId: ctx.workspaceId, businessId: ctx.businessId, branchId: ctx.branchId, number, entryDate: p.date,
      memo: p.memo, source: p.source, sourceId: p.sourceId, reversesId: p.reverses, deviceId: ctx.deviceId, operator: ctx.operator,
    })
    .returning({ id: journalEntries.id });
  await tx.insert(journalLines).values(
    p.lines.map((l) => ({
      entryId: je.id, workspaceId: ctx.workspaceId, accountId: l.accountId,
      debit: l.debit ?? "0", credit: l.credit ?? "0", memo: l.memo,
    })),
  );
  return je.id;
}

/** Posted journal immutable: koreksi hanya lewat jurnal pembalik. */
export async function reverseJournal(tx: Tx, ctx: Ctx, journalId: string, date: string, memo: string): Promise<string> {
  const res = await tx.execute(sql`select id, status, memo from journal_entries where id = ${journalId} and workspace_id = ${ctx.workspaceId} for update`);
  const row = res.rows[0] as { id: string; status: string; memo: string } | undefined;
  if (!row) throw new HttpError(404, "Jurnal tidak ditemukan", "not_found");
  if (row.status !== "posted") throw new HttpError(409, "Jurnal sudah dibalik.", "already_reversed");
  const lines = await tx.select().from(journalLines).where(eq(journalLines.entryId, journalId));
  const revId = await postJournal(tx, ctx, {
    date, memo: `${memo} (pembalikan ${row.memo ?? ""})`.trim(), source: "reversal", sourceId: journalId, reverses: journalId,
    lines: lines.map((l) => ({ accountId: l.accountId, debit: l.credit, credit: l.debit, memo: l.memo ?? undefined })),
  });
  await tx.update(journalEntries).set({ status: "reversed", reversedById: revId }).where(eq(journalEntries.id, journalId));
  return revId;
}

/** Saldo per akun (debit, kredit) dalam rentang tanggal. Sumber tunggal untuk semua laporan. */
export async function accountTotals(d: DB, workspaceId: string, from?: string, to?: string) {
  const res = await d.execute(sql`
    select a.id, a.code, a.name, a.type, a.subtype,
      coalesce(sum(jl.debit),0)::text as debit, coalesce(sum(jl.credit),0)::text as credit
    from coa_accounts a
    left join (
      select l.account_id, l.debit, l.credit from journal_lines l
      join journal_entries e on e.id = l.entry_id
      where l.workspace_id = ${workspaceId}
        and (${from ?? null}::date is null or e.entry_date >= ${from ?? null}::date)
        and (${to ?? null}::date is null or e.entry_date <= ${to ?? null}::date)
    ) jl on jl.account_id = a.id
    where a.workspace_id = ${workspaceId}
    group by a.id order by a.code`);
  return res.rows as { id: string; code: string; name: string; type: string; subtype: string | null; debit: string; credit: string }[];
}

/** Saldo normal: aset & beban = debit - kredit; lainnya = kredit - debit. */
export function normalBalance(type: string, debit: string, credit: string): string {
  const d = toCents(debit), c = toCents(credit);
  return fromCents(type === "asset" || type === "expense" ? d - c : c - d);
}
