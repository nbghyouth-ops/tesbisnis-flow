"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Card, DataTable, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { fmtDateTime, useApi } from "@/lib/client";

export default function Legal() {
  const { data, error, loading, reload } = useApi<any>("/legal");
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  return (
    <>
      <PageHeader label="Configuration" title="Syarat & Privasi" desc="Dokumen yang berlaku dan riwayat persetujuan workspace (tidak diubah saat dokumen diperbarui)." />
      <div className="grid gap-6">
        {data.documents.map((d: any) => (
          <Card key={d.kind + d.version} title={`${d.title} — versi ${d.version}`} desc={`Berlaku sejak ${fmtDateTime(d.effectiveAt)}`}>
            <div className="space-y-2 text-sm text-ink-2">{d.body.split("\n\n").map((p: string) => <p key={p}>{p}</p>)}</div>
          </Card>))}
        <Card title="Riwayat persetujuan">
          <DataTable rows={data.acceptances} caption="Persetujuan" columns={[{ key: "kind", label: "Dokumen", render: (a: any) => (a.kind === "terms" ? "Syarat & Ketentuan" : "Kebijakan Privasi") }, { key: "version", label: "Versi" }, { key: "acceptedAt", label: "Waktu", render: (a: any) => fmtDateTime(a.acceptedAt) }]} />
        </Card>
        <p className="text-xs text-ink-2">Dokumen adalah templat awal dan bukan nasihat hukum. Kepatuhan UU PDP, transfer data lintas negara, dan kewajiban PSE perlu dikaji penasihat hukum.</p>
      </div>
    </>
  );
}
