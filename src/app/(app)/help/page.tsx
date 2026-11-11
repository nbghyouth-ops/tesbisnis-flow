"use client";
import { useState } from "react";
import { FAQ, GLOSSARY, GuideContent, TROUBLE } from "@/components/guide";
import { startTour } from "@/components/shell";
import { Button, Card, PageHeader, Tabs } from "@/components/ui";

export default function Help() {
  const [tab, setTab] = useState("guide");
  return (
    <>
      <PageHeader label="Configuration" title="Pusat Bantuan" desc="Panduan, FAQ, glosarium, dan pemecahan masalah — hanya untuk fitur yang tersedia." actions={<Button onClick={startTour}>Mulai / ulangi tur terpandu</Button>} />
      <Tabs tabs={[{ key: "guide", label: "Panduan" }, { key: "faq", label: "FAQ" }, { key: "glossary", label: "Glosarium" }, { key: "trouble", label: "Pemecahan Masalah" }]} value={tab} onChange={setTab} />
      {tab === "guide" && <GuideContent />}
      {tab === "faq" && <div className="grid gap-3">{FAQ.map((f) => <Card key={f.q} title={f.q}><p className="text-sm text-ink-2">{f.a}</p></Card>)}</div>}
      {tab === "glossary" && <Card><dl className="grid gap-3">{GLOSSARY.map((g) => <div key={g.t}><dt className="text-sm font-semibold">{g.t}</dt><dd className="text-sm text-ink-2">{g.d}</dd></div>)}</dl></Card>}
      {tab === "trouble" && <div className="grid gap-3">{TROUBLE.map((f) => <Card key={f.q} title={f.q}><p className="text-sm text-ink-2">{f.a}</p></Card>)}</div>}
    </>
  );
}
