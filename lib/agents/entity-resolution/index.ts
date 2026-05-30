import type { z } from "zod";

import {
  entityResolutionContextSchema,
  entityResolutionOptionsSchema,
  entityResolutionSourceItemSchema,
  entityTypeSchema,
  resolvedEntityListSchema,
  resolvedEntitySchema,
} from "./schemas";
import type { EntityResolutionContact, EntityResolutionContext, EntityResolutionOptions, EntityResolutionSourceItem, EntityType, ResolvedEntity } from "./types";

const ROLE_ALIASES: Array<{ pattern: RegExp; normalizedValue: string }> = [
  { pattern: /\bCFO\b/gi, normalizedValue: "Chief Financial Officer" },
  { pattern: /\blegal\b/gi, normalizedValue: "legal" },
  { pattern: /\bprocurement\b/gi, normalizedValue: "procurement" },
  { pattern: /\bsecurity\b/gi, normalizedValue: "security" },
];

const INTERNAL_OWNER_ALIASES: Array<{ pattern: RegExp; normalizedValue: string }> = [
  { pattern: /\binternal finance\b/gi, normalizedValue: "internal finance" },
  { pattern: /\bSE\b/g, normalizedValue: "sales engineer" },
  { pattern: /\bsales engineer\b/gi, normalizedValue: "sales engineer" },
  { pattern: /\bdeal desk\b/gi, normalizedValue: "deal desk" },
  { pattern: /\blegal owner\b/gi, normalizedValue: "legal owner" },
];

const DOCUMENT_ALIASES: Array<{ pattern: RegExp; normalizedValue: string }> = [
  { pattern: /\bMSA\b/g, normalizedValue: "MSA" },
  { pattern: /\bDPA\b/g, normalizedValue: "DPA" },
  { pattern: /\bsecurity questionnaire\b/gi, normalizedValue: "security questionnaire" },
  { pattern: /\border form\b/gi, normalizedValue: "order form" },
];

const RISK_KEYWORD_ALIASES: Array<{ pattern: RegExp; normalizedValue: string; confidence?: number }> = [
  { pattern: /\bblocked\b/gi, normalizedValue: "blocked" },
  { pattern: /\bpending\b/gi, normalizedValue: "pending" },
  { pattern: /\bstuck\b/gi, normalizedValue: "stuck" },
  { pattern: /\bdelayed\b/gi, normalizedValue: "delayed" },
  { pattern: /\bcompetitor\b/gi, normalizedValue: "competitor" },
  { pattern: /\bsecurity review\b/gi, normalizedValue: "security review" },
];

const AMBIGUOUS_STAKEHOLDER_ALIASES: Array<{ pattern: RegExp; normalizedValue: string }> = [
  { pattern: /\b(?:he|she|they|them|their)\b/gi, normalizedValue: "ambiguous pronoun" },
  { pattern: /\b(?:stakeholder|decision maker|approver|buyer|exec sponsor)\b/gi, normalizedValue: "unresolved stakeholder" },
];

const ISO_DATE_PATTERN = /\b\d{4}-\d{2}-\d{2}\b/g;
const CURRENCY_PATTERN = /(?:\b(?:USD|EUR|GBP|CAD|AUD)\s*)?[$€£]\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?\s?(?:[kKmMbB])?\b|\b(?:USD|EUR|GBP|CAD|AUD)\s+\d{1,3}(?:,\d{3})*(?:\.\d+)?\s?(?:[kKmMbB])?\b/g;
const PERCENT_PATTERN = /\b\d+(?:\.\d+)?%\s*(?:discount|uplift|increase|decrease|renewal|margin)?\b/gi;
const QUARTER_PATTERN = /\b(?:Q[1-4](?:\s*FY?\s*\d{2,4})?|end of quarter|EOQ|quarter end)\b/gi;
const END_OF_MONTH_PATTERN = /\b(?:end of month|EOM|month end)\b/gi;
const SOON_PATTERN = /\bsoon\b/gi;
const NEXT_WEEKDAY_PATTERN = /\bnext\s+(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/gi;
const COMPETITOR_NAME_PATTERN = /\b(?:competitor|competing with|versus|vs\.?|lost to|evaluating)\s+([A-Z][A-Za-z0-9&.-]*(?:\s+[A-Z][A-Za-z0-9&.-]*){0,3})/g;
const PRODUCT_MODULE_PATTERN = /\b([A-Z][A-Za-z0-9+.-]*(?:\s+[A-Z][A-Za-z0-9+.-]*){0,3})\s+(?:product|module|SKU|package|add-on|addon)\b/g;

export function resolveEntities(contextInput: z.input<typeof entityResolutionContextSchema>, optionsInput: z.input<typeof entityResolutionOptionsSchema> = {}): ResolvedEntity[] {
  const context = entityResolutionContextSchema.parse(contextInput);
  const options = entityResolutionOptionsSchema.parse(optionsInput);
  const entities: ResolvedEntity[] = [];

  for (const sourceItem of context.sourceItems) {
    entities.push(...extractFromSourceItem(sourceItem, context, options));
  }

  return resolvedEntityListSchema.parse(dedupeEntities(entities));
}

export function resolveEntitiesFromText(text: string, contextInput: Partial<EntityResolutionContext> = {}, optionsInput: z.input<typeof entityResolutionOptionsSchema> = {}): ResolvedEntity[] {
  const sourceItem = entityResolutionSourceItemSchema.parse({ id: "inline-text", title: null, body: text, occurredAt: null, metadata: {} });
  const context = entityResolutionContextSchema.parse({ ...contextInput, sourceItems: [sourceItem] });
  return resolveEntities(context, optionsInput);
}

function extractFromSourceItem(sourceItem: EntityResolutionSourceItem, context: EntityResolutionContext, options: EntityResolutionOptions): ResolvedEntity[] {
  const text = [sourceItem.title, sourceItem.body, sourceItem.metadata?.matchedText].filter((value): value is string => typeof value === "string" && value.length > 0).join("\n");
  if (!text.trim()) {
    return [];
  }

  const entities: ResolvedEntity[] = [];

  addContextRecordMention(entities, text, sourceItem, "account", context.account?.name ?? null, context.account?.externalId ?? context.account?.id ?? context.account?.name ?? null, 0.9);
  addContextRecordMention(entities, text, sourceItem, "opportunity", context.opportunity?.name ?? null, context.opportunity?.externalId ?? context.opportunity?.id ?? context.opportunity?.name ?? null, 0.9);
  extractContacts(entities, text, sourceItem, context.contacts);
  extractAliasMatches(entities, text, sourceItem, "role", ROLE_ALIASES, 0.82);
  extractAliasMatches(entities, text, sourceItem, "internal owner", INTERNAL_OWNER_ALIASES, 0.84);
  extractAliasMatches(entities, text, sourceItem, "document", DOCUMENT_ALIASES, 0.88);
  extractDates(entities, text, sourceItem, options);
  extractAmounts(entities, text, sourceItem);
  extractAliasMatches(entities, text, sourceItem, "risk keyword", RISK_KEYWORD_ALIASES, 0.86);
  extractAliasMatches(entities, text, sourceItem, "role", AMBIGUOUS_STAKEHOLDER_ALIASES, 0.38);
  extractCompetitors(entities, text, sourceItem);
  extractProductModules(entities, text, sourceItem);

  return entities;
}

function extractContacts(entities: ResolvedEntity[], text: string, sourceItem: EntityResolutionSourceItem, contacts: EntityResolutionContact[]): void {
  const firstNameCounts = new Map<string, number>();
  for (const contact of contacts) {
    const firstName = normalizeWhitespace(contact.firstName ?? "");
    if (firstName) {
      firstNameCounts.set(firstName.toLowerCase(), (firstNameCounts.get(firstName.toLowerCase()) ?? 0) + 1);
    }
  }

  for (const contact of contacts) {
    const fullName = contactFullName(contact);
    const normalizedValue = contact.externalId ?? contact.id;
    if (fullName && fullName.includes(" ")) {
      addLiteralMatches(entities, text, sourceItem, "contact", fullName, normalizedValue, 0.94);
    }

    const firstName = normalizeWhitespace(contact.firstName ?? "");
    if (firstName && (firstNameCounts.get(firstName.toLowerCase()) ?? 0) === 1) {
      addLiteralMatches(entities, text, sourceItem, "contact", firstName, normalizedValue, 0.78);
    }

    if (contact.email) {
      addLiteralMatches(entities, text, sourceItem, "contact", contact.email, normalizedValue, 0.92);
    }
  }
}

function extractDates(entities: ResolvedEntity[], text: string, sourceItem: EntityResolutionSourceItem, options: EntityResolutionOptions): void {
  for (const match of text.matchAll(ISO_DATE_PATTERN)) {
    const rawText = match[0];
    const parsed = new Date(`${rawText}T00:00:00.000Z`);
    addEntity(entities, sourceItem, text, match.index ?? 0, rawText, "date", Number.isNaN(parsed.getTime()) ? rawText : rawText, Number.isNaN(parsed.getTime()) ? 0.45 : 0.94);
  }

  for (const match of text.matchAll(NEXT_WEEKDAY_PATTERN)) {
    const rawText = match[0];
    const weekday = match[1];
    const baseDate = sourceItem.occurredAt ?? sourceItem.ingestedAt ?? options.referenceDate;
    const normalizedValue = baseDate ? nextWeekdayDate(baseDate, weekday).toISOString().slice(0, 10) : rawText.toLowerCase();
    addEntity(entities, sourceItem, text, match.index ?? 0, rawText, "date", normalizedValue, baseDate ? 0.78 : 0.42);
  }

  for (const match of text.matchAll(END_OF_MONTH_PATTERN)) {
    const rawText = match[0];
    const baseDate = sourceItem.occurredAt ?? sourceItem.ingestedAt ?? options.referenceDate;
    const normalizedValue = baseDate ? endOfMonth(baseDate).toISOString().slice(0, 10) : rawText.toLowerCase();
    addEntity(entities, sourceItem, text, match.index ?? 0, rawText, "date", normalizedValue, baseDate ? 0.7 : 0.4);
  }

  for (const match of text.matchAll(QUARTER_PATTERN)) {
    const rawText = match[0];
    const baseDate = sourceItem.occurredAt ?? sourceItem.ingestedAt ?? options.referenceDate;
    const normalizedValue = normalizeQuarter(rawText, baseDate);
    const isAmbiguous = /end of quarter|EOQ|quarter end/i.test(rawText) && !baseDate;
    addEntity(entities, sourceItem, text, match.index ?? 0, rawText, "date", normalizedValue, isAmbiguous ? 0.38 : 0.62);
  }

  for (const match of text.matchAll(SOON_PATTERN)) {
    addEntity(entities, sourceItem, text, match.index ?? 0, match[0], "date", "ambiguous relative date: soon", 0.3);
  }
}

function extractAmounts(entities: ResolvedEntity[], text: string, sourceItem: EntityResolutionSourceItem): void {
  for (const match of text.matchAll(CURRENCY_PATTERN)) {
    addEntity(entities, sourceItem, text, match.index ?? 0, match[0], "amount", normalizeAmount(match[0]), 0.9);
  }

  for (const match of text.matchAll(PERCENT_PATTERN)) {
    addEntity(entities, sourceItem, text, match.index ?? 0, match[0], "amount", normalizeWhitespace(match[0].toLowerCase()), 0.88);
  }
}

function extractCompetitors(entities: ResolvedEntity[], text: string, sourceItem: EntityResolutionSourceItem): void {
  for (const match of text.matchAll(COMPETITOR_NAME_PATTERN)) {
    const competitorName = normalizeCompetitorName(match[1]);
    if (competitorName && !/review|discount|pricing|procurement|security/i.test(competitorName)) {
      addEntity(entities, sourceItem, text, match.index ?? 0, match[0], "competitor", competitorName, 0.7);
    }
  }
}

function extractProductModules(entities: ResolvedEntity[], text: string, sourceItem: EntityResolutionSourceItem): void {
  for (const match of text.matchAll(PRODUCT_MODULE_PATTERN)) {
    addEntity(entities, sourceItem, text, match.index ?? 0, match[0], "product/module", normalizeWhitespace(match[1]), 0.66);
  }
}

function extractAliasMatches(entities: ResolvedEntity[], text: string, sourceItem: EntityResolutionSourceItem, entityType: EntityType, aliases: Array<{ pattern: RegExp; normalizedValue: string; confidence?: number }>, defaultConfidence: number): void {
  for (const alias of aliases) {
    alias.pattern.lastIndex = 0;
    for (const match of text.matchAll(alias.pattern)) {
      addEntity(entities, sourceItem, text, match.index ?? 0, match[0], entityType, alias.normalizedValue, alias.confidence ?? defaultConfidence);
    }
  }
}

function addContextRecordMention(entities: ResolvedEntity[], text: string, sourceItem: EntityResolutionSourceItem, entityType: EntityType, name: string | null, normalizedValue: string | null, confidence: number): void {
  if (!name || !normalizedValue) {
    return;
  }
  addLiteralMatches(entities, text, sourceItem, entityType, name, normalizedValue, confidence);
}

function addLiteralMatches(entities: ResolvedEntity[], text: string, sourceItem: EntityResolutionSourceItem, entityType: EntityType, literal: string, normalizedValue: string, confidence: number): void {
  const escaped = escapeRegExp(literal.trim());
  if (!escaped) {
    return;
  }
  const pattern = new RegExp(`(^|[^A-Za-z0-9@.])(${escaped})(?![A-Za-z0-9@.])`, "gi");
  for (const match of text.matchAll(pattern)) {
    const rawText = match[2];
    const index = (match.index ?? 0) + match[1].length;
    addEntity(entities, sourceItem, text, index, rawText, entityType, normalizedValue, confidence);
  }
}

function addEntity(entities: ResolvedEntity[], sourceItem: EntityResolutionSourceItem, fullText: string, index: number, rawText: string, entityType: EntityType, normalizedValue: string, confidence: number): void {
  const parsedType = entityTypeSchema.parse(entityType);
  const entity = resolvedEntitySchema.parse({
    entityType: parsedType,
    rawText: normalizeWhitespace(rawText),
    normalizedValue: normalizeWhitespace(normalizedValue),
    confidence: roundConfidence(confidence),
    sourceItemId: sourceItem.id,
    evidenceText: evidenceSnippet(fullText, index, rawText.length),
  });
  entities.push(entity);
}

function dedupeEntities(entities: ResolvedEntity[]): ResolvedEntity[] {
  const byKey = new Map<string, ResolvedEntity>();
  for (const entity of entities) {
    const key = [entity.sourceItemId, entity.entityType, entity.rawText.toLowerCase(), entity.normalizedValue.toLowerCase()].join("|");
    const existing = byKey.get(key);
    if (!existing || entity.confidence > existing.confidence) {
      byKey.set(key, entity);
    }
  }
  return [...byKey.values()].sort((left, right) => left.sourceItemId.localeCompare(right.sourceItemId) || right.confidence - left.confidence || left.entityType.localeCompare(right.entityType) || left.rawText.localeCompare(right.rawText));
}

function contactFullName(contact: EntityResolutionContact): string {
  return normalizeWhitespace(contact.fullName ?? [contact.firstName, contact.lastName].filter(Boolean).join(" "));
}

function nextWeekdayDate(baseDate: Date, weekday: string): Date {
  const target = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(weekday.toLowerCase());
  const base = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), baseDate.getUTCDate()));
  const delta = (target - base.getUTCDay() + 7) % 7 || 7;
  base.setUTCDate(base.getUTCDate() + delta);
  return base;
}

function endOfMonth(baseDate: Date): Date {
  return new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + 1, 0));
}

function normalizeQuarter(rawText: string, baseDate: Date | undefined): string {
  const explicit = rawText.match(/Q([1-4])(?:\s*FY?\s*(\d{2,4}))?/i);
  if (explicit) {
    const quarter = Number(explicit[1]);
    const yearText = explicit[2];
    const year = yearText ? normalizeYear(yearText) : baseDate?.getUTCFullYear();
    return year ? `Q${quarter} ${year}` : `Q${quarter}`;
  }

  if (!baseDate) {
    return `ambiguous relative date: ${rawText.toLowerCase()}`;
  }

  const quarter = Math.floor(baseDate.getUTCMonth() / 3) + 1;
  const quarterEndMonth = quarter * 3;
  const quarterEnd = new Date(Date.UTC(baseDate.getUTCFullYear(), quarterEndMonth, 0));
  return quarterEnd.toISOString().slice(0, 10);
}

function normalizeYear(yearText: string): number {
  const year = Number(yearText);
  return year < 100 ? 2000 + year : year;
}

function normalizeAmount(rawText: string): string {
  return normalizeWhitespace(rawText.replace(/\s+/g, " ").toUpperCase().replace(/\$\s?/, "USD ").replace(/€\s?/, "EUR ").replace(/£\s?/, "GBP "));
}

function normalizeCompetitorName(rawText: string): string {
  return normalizeWhitespace(rawText.replace(/[.,;:!?]+$/g, ""));
}

function evidenceSnippet(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 48);
  const end = Math.min(text.length, index + length + 48);
  return normalizeWhitespace(`${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function roundConfidence(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
}

export {
  entityResolutionAccountSchema,
  entityResolutionContactSchema,
  entityResolutionContextSchema,
  entityResolutionOpportunitySchema,
  entityResolutionOptionsSchema,
  entityResolutionSourceItemSchema,
  entityTypeSchema,
  resolvedEntityListSchema,
  resolvedEntitySchema,
} from "./schemas";
export type {
  EntityResolutionAccount,
  EntityResolutionContact,
  EntityResolutionContext,
  EntityResolutionOpportunity,
  EntityResolutionOptions,
  EntityResolutionSourceItem,
  EntityType,
  ResolvedEntity,
  ResolvedEntityList,
} from "./types";
