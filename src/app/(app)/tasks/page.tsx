"use client";
import { ResourcePage } from "@/components/resource-page";
import { PageHeader } from "@/components/ui";

export default function Tasks() {
  return (
    <>
      <PageHeader label="Management" title="Tugas & Tim" desc="Tugas dengan prioritas, tenggat, dan penanggung jawab. Aktivitas dicatat atas nama perangkat/operator." />
      <ResourcePage resource="tasks" />
    </>
  );
}
