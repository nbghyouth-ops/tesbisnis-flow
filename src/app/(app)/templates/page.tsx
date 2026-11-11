"use client";
import Link from "next/link";
import { useBiz } from "@/components/shell";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { api, toast } from "@/lib/client";
import { TEMPLATES } from "@/lib/templates";

export default function Templates() {
  const biz = useBiz();
  async function use(key: string) {
    if (!confirm("Ganti template? Hanya prioritas navigasi dan panduan awal yang berubah; data tidak dihapus.")) return;
    try { await api("/business", { method: "PATCH", body: { templateKey: key } }); toast("Template diganti"); biz.reload(); } catch (e) { toast((e as Error).message, "err"); }
  }
  return (
    <>
      <PageHeader label="Configuration" title="Template Bisnis" desc="16 template = konfigurasi workflow: modul prioritas, istilah, kategori awal, dan langkah awal. Semua modul tetap tersedia." />
      <div className="grid gap-4 md:grid-cols-2">
        {TEMPLATES.map((t) => {
          const active = biz.business.templateKey === t.key;
          return (
            <Card key={t.key} title={t.name} desc={t.summary} actions={active ? <Badge tone="good">Aktif</Badge> : biz.can("settings:write") ? <Button variant="secondary" onClick={() => use(t.key)}>Gunakan</Button> : undefined}>
              <ol className="grid gap-1.5 text-sm">{t.workflow.map((w, i) => <li key={i}><Link href={w.href} className="text-primary-deep hover:underline">{i + 1}. {w.text}</Link></li>)}</ol>
              {t.scope && <p className="mt-3 rounded-lg bg-cream px-3 py-2 text-xs text-ink">Cakupan saat ini: {t.scope}</p>}
            </Card>);
        })}
      </div>
    </>
  );
}
