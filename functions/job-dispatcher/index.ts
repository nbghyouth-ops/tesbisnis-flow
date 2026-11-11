/**
 * Neon Function: central job dispatcher (BELUM DIDEPLOY / BELUM DIUJI di Neon).
 * Bentuk handler mengikuti dokumentasi Neon Functions: export default { fetch(request) }.
 * Trigger terjadwal dibuat PEMILIK di Neon (cron "*\/5 * * * *"), bukan di Vercel.
 *
 * Keamanan: handler TIDAK mempercayai isi request (job type/tenant berasal dari tabel `jobs` dan registry
 * di bawah). Pemanggilan tak sah hanya memicu pemrosesan job jatuh-tempo yang terbatas & idempoten.
 * Verifikasi identitas pemanggil Trigger harus dikonfirmasi dari dokumentasi autentikasi Neon (lihat
 * docs/deployment/NEON_FUNCTIONS_SETUP.md) — jangan mengklaim sudah terverifikasi.
 * DATABASE_URL disuntikkan otomatis oleh runtime Neon Functions.
 */
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
const WORKER = `dispatcher-${Math.random().toString(36).slice(2, 8)}`;
const BATCH = 20;
const LEASE_SECONDS = 120;
const BUDGET_MS = 25_000;

type Job = { id: string; workspace_id: string; type: string; payload: Record<string, unknown>; attempts: number; max_attempts: number; checkpoint: Record<string, unknown> };
type Handler = (job: Job) => Promise<Record<string, unknown> | void>;

/** Registry job yang diizinkan (allowlist). */
const HANDLERS: Record<string, Handler> = {
  async "invoice.due_reminder"(job) {
    await pool.query(
      `insert into notifications (workspace_id, business_id, kind, title, body)
       select i.workspace_id, i.business_id, 'invoice_due', 'Faktur ' || i.number || ' jatuh tempo', 'Sisa tagihan ' || (i.total - i.paid)::text
       from invoices i where i.workspace_id = $1 and i.status in ('unpaid','partial') and i.due_date <= current_date`,
      [job.workspace_id],
    );
  },
  async "stock.low_alert"(job) {
    await pool.query(
      `insert into notifications (workspace_id, business_id, kind, title, body)
       select p.workspace_id, p.business_id, 'low_stock', 'Stok menipis: ' || p.name, 'Batas reorder ' || p.reorder_level::text
       from products p left join stock_movements m on m.product_id = p.id
       where p.workspace_id = $1 and p.track_stock and p.reorder_level > 0
       group by p.id having coalesce(sum(m.quantity),0) <= p.reorder_level`,
      [job.workspace_id],
    );
  },
};

async function maintenance() {
  // Pemulihan lease kedaluwarsa & pembersihan sesi tab lama (idempoten).
  await pool.query(`update jobs set status = 'retry_wait', lease_owner = null, lease_expires_at = null where status = 'leased' and lease_expires_at < now()`);
  await pool.query(`delete from tab_sessions where expires_at < now() - interval '1 day'`);
  await pool.query(`delete from idempotency_keys where created_at < now() - interval '30 days'`);
}

async function claim(): Promise<Job[]> {
  const r = await pool.query<Job>(
    `with due as (
       select id from jobs where status in ('pending','retry_wait') and next_run_at <= now()
       order by next_run_at limit $1 for update skip locked)
     update jobs j set status = 'leased', lease_owner = $2, lease_expires_at = now() + ($3 || ' seconds')::interval, attempts = attempts + 1
     from due where j.id = due.id
     returning j.id, j.workspace_id, j.type, j.payload, j.attempts, j.max_attempts, j.checkpoint`,
    [BATCH, WORKER, String(LEASE_SECONDS)],
  );
  return r.rows;
}

async function run(job: Job) {
  const h = HANDLERS[job.type];
  try {
    if (!h) throw new Error(`unknown job type: ${job.type}`);
    const checkpoint = (await h(job)) ?? job.checkpoint;
    await pool.query(`update jobs set status = 'succeeded', lease_owner = null, lease_expires_at = null, checkpoint = $2, last_error = null where id = $1`, [job.id, checkpoint]);
  } catch (e) {
    const dead = job.attempts >= job.max_attempts || !h;
    const backoff = Math.min(2 ** job.attempts * 30, 3600) + Math.floor(Math.random() * 15); // exponential + jitter
    await pool.query(
      `update jobs set status = $2, lease_owner = null, lease_expires_at = null, last_error = $3, next_run_at = now() + ($4 || ' seconds')::interval where id = $1`,
      [job.id, dead ? "dead_letter" : "retry_wait", String((e as Error).message).slice(0, 500), String(backoff)],
    );
  }
}

export default {
  async fetch(_request: Request): Promise<Response> {
    const started = Date.now();
    let processed = 0;
    try {
      await maintenance();
      while (Date.now() - started < BUDGET_MS) {
        const jobs = await claim();
        if (!jobs.length) break;
        for (const j of jobs) {
          if (Date.now() - started >= BUDGET_MS) { // kembalikan lease agar diproses di invocation berikutnya
            await pool.query(`update jobs set status = 'retry_wait', lease_owner = null, lease_expires_at = null, attempts = attempts - 1 where id = $1`, [j.id]);
            continue;
          }
          await run(j); processed++;
        }
      }
      return Response.json({ ok: true, processed });
    } catch {
      return Response.json({ ok: false }, { status: 500 });
    }
  },
};
