"use client";
import { useState } from "react";
import { ResourcePage } from "@/components/resource-page";
import { PageHeader, Tabs } from "@/components/ui";

export default function Hr() {
  const [tab, setTab] = useState("emp");
  return (
    <>
      <PageHeader label="Management" title="Karyawan & HR" desc="Catatan karyawan dan absensi. Catatan karyawan bukan akun login dan bukan bukti identitas. Payroll/cuti/lembur belum tersedia pada versi ini." />
      <Tabs tabs={[{ key: "emp", label: "Karyawan" }, { key: "att", label: "Absensi" }]} value={tab} onChange={setTab} />
      {tab === "emp" ? <ResourcePage resource="employees" /> : <ResourcePage resource="attendance" hint="Catat kehadiran per karyawan per tanggal." />}
    </>
  );
}
