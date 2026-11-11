"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { ResourcePage } from "@/components/resource-page";
import { useBiz } from "@/components/shell";
import { PageHeader, Tabs } from "@/components/ui";
import { useApi } from "@/lib/client";
import { formatMoney } from "@/lib/money";

export default function Projects() {
  const biz = useBiz();
  const [tab, setTab] = useState("p");
  const costs = useApi<any>("/projects/costs");
  const map = useMemo(() => new Map<string, string>((costs.data?.items ?? []).map((c: any) => [c.projectId, c.cost])), [costs.data]);
  const extra = useMemo(() => [{ key: "cost", label: "Biaya aktual", right: true, render: (r: any) => formatMoney(map.get(r.id) ?? "0", biz.currency) }], [map, biz.currency]);
  return (
    <>
      <PageHeader label="Management" title="Proyek" desc="Biaya aktual dihitung dari transaksi pengeluaran terposting yang ditautkan ke proyek lewat Transaksi Cepat (terhubung ke pembukuan utama)." />
      <Tabs tabs={[{ key: "p", label: "Proyek" }, { key: "t", label: "Tugas Proyek" }]} value={tab} onChange={setTab} />
      {tab === "p" ? <ResourcePage resource="projects" extraColumns={extra} /> : <ResourcePage resource="tasks" title="Tugas (tautkan ke proyek lewat kolom Proyek)" />}
    </>
  );
}
