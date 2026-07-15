"use client";

import React from "react";
import { AuditLogView } from "@/app/components/workflow-ui";
import { auditEntries } from "@/lib/ui-workflow-data";

export function AuditLogClient() {
  return <AuditLogView entries={auditEntries} />;
}
