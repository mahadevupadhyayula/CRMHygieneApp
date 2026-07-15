"use client";

import React from "react";
import type { SimulatedCrmSnapshot } from "../../../lib/agents/writeback";

type Row = { field: string; label: string; before: unknown; after: unknown; changed: boolean };

function text(value: unknown) { return value === null || value === undefined || value === "" ? "—" : String(value); }
function firstOpportunity(snapshot?: SimulatedCrmSnapshot) { return Object.values(snapshot?.opportunities ?? {})[0]; }

export function getCrmDiffRows(before?: SimulatedCrmSnapshot, after?: SimulatedCrmSnapshot): Row[] {
  const beforeFields = firstOpportunity(before)?.fields ?? {};
  const afterFields = firstOpportunity(after)?.fields ?? {};
  return Array.from(new Set([...Object.keys(beforeFields), ...Object.keys(afterFields)])).map((field) => {
    const beforeValue = beforeFields[field]?.value;
    const afterValue = afterFields[field]?.value;
    return { field, label: afterFields[field]?.label ?? beforeFields[field]?.label ?? field, before: beforeValue, after: afterValue, changed: text(beforeValue) !== text(afterValue) };
  });
}

export function CrmDiff({ before, after }: { before?: SimulatedCrmSnapshot; after?: SimulatedCrmSnapshot }) {
  const rows = getCrmDiffRows(before, after);
  const changed = rows.some((row) => row.changed);
  return <section className="panel wide" data-testid="crm-diff"><h2>CRM before / after state</h2><p data-testid="crm-changed-summary">CRM state changed: {changed ? "yes" : "no — CRM state remained unchanged"}</p><table><thead><tr><th>Field</th><th>Before</th><th>After</th><th>Changed</th></tr></thead><tbody>{rows.map((row) => <tr key={row.field} data-testid={`crm-diff-${row.field}`}><td>{row.label}</td><td data-testid={`crm-before-${row.field}`}>{text(row.before)}</td><td data-testid={`crm-after-${row.field}`}>{text(row.after)}</td><td>{row.changed ? "changed" : "unchanged"}</td></tr>)}</tbody></table></section>;
}
