"use client";

import React from "react";
import { useState } from "react";

import { DashboardView } from "@/app/components/workflow-ui";
import type { RiskLevel } from "@/lib/ui-workflow-data";

export function DashboardClient() {
  const [risk, setRisk] = useState<RiskLevel | "all">("all");

  return (
    <div onChange={(event) => {
      const target = event.target as unknown as HTMLSelectElement;
      if (target?.name === "risk") setRisk(target.value as RiskLevel | "all");
    }}>
      <DashboardView selectedRisk={risk} />
    </div>
  );
}
