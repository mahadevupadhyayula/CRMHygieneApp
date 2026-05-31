"use client";

import React from "react";
import { useEffect, useState } from "react";

import { AuditLogView } from "@/app/components/workflow-ui";
import { auditEntries, type AuditEntry } from "@/lib/ui-workflow-data";

const AUDIT_KEY = "crm-hygiene-stage12-audit";

export function AuditLogClient() {
  const [entries, setEntries] = useState<AuditEntry[]>(auditEntries);

  useEffect(() => {
    const saved = window.localStorage.getItem(AUDIT_KEY);
    if (saved) setEntries(JSON.parse(saved));
  }, []);

  return <AuditLogView entries={entries} />;
}
