import { SourceVisibility, type Account, type Contact, type CRMFieldSnapshot, type Opportunity, type OpportunityContact, type PrismaClient, type SourceItem } from "@prisma/client";

import { dealContextPackageSchema, sourceMetadataSchema } from "./schemas";
import { OpportunityNotFoundError, type ActivityHistoryItem, type ContactContext, type DealContextPackage, type IngestionWarning, type SourceItemContext, type SourceMetadata } from "./types";

type OpportunityContactWithContact = OpportunityContact & { contact: Contact };
type LoadedOpportunity = Opportunity & {
  account: Account;
  contacts: OpportunityContactWithContact[];
  fieldSnapshots: CRMFieldSnapshot[];
  sourceItems: SourceItem[];
};

type ParsedSourceItem = SourceItemContext & { metadataParseFailed: boolean };

const SOURCE_METADATA_REQUIRED_KEYS = ["externalId", "sourceSystem", "linkedRecord", "authorization"] as const;

export async function ingestDealContext(prisma: PrismaClient, opportunityId: string): Promise<DealContextPackage> {
  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    include: {
      account: true,
      contacts: { include: { contact: true } },
      fieldSnapshots: true,
      sourceItems: true,
    },
  });

  if (!opportunity) {
    throw new OpportunityNotFoundError(opportunityId);
  }

  return buildDealContextPackage(opportunity);
}

export function buildDealContextPackage(opportunity: LoadedOpportunity, generatedAt = new Date()): DealContextPackage {
  const warnings: IngestionWarning[] = [];
  const contacts = sortContacts(opportunity.contacts.map(toContactContext));
  const crmSnapshot = sortCrmSnapshots(opportunity.fieldSnapshots);
  const parsedSourceItems = opportunity.sourceItems.map((sourceItem) => parseSourceItem(sourceItem, warnings));
  const visibleSourceItems = filterSourceItems(parsedSourceItems, warnings);
  const { sourceItems, duplicateCount } = deduplicateSourceItems(visibleSourceItems, warnings);
  const sortedSourceItems = sortSourceItems(sourceItems);
  const activityHistory = sortActivityHistory(sortedSourceItems.map(toActivityHistoryItem));

  if (!opportunity.account) {
    warnings.push({
      code: "MISSING_ACCOUNT",
      severity: "error",
      message: `Opportunity ${opportunity.id} has no related account loaded.`,
      recordIds: [opportunity.id],
    });
  }

  if (contacts.length === 0) {
    warnings.push({
      code: "MISSING_CONTACTS",
      severity: "warning",
      message: `Opportunity ${opportunity.id} has no linked contacts.`,
      recordIds: [opportunity.id],
    });
  }

  if (crmSnapshot.length === 0) {
    warnings.push({
      code: "MISSING_CRM_SNAPSHOT",
      severity: "warning",
      message: `Opportunity ${opportunity.id} has no CRM field snapshots.`,
      recordIds: [opportunity.id],
    });
  }

  if (sortedSourceItems.length === 0) {
    warnings.push({
      code: "MISSING_AUTHORIZED_SOURCE_ITEMS",
      severity: "warning",
      message: `Opportunity ${opportunity.id} has no authorized source items available for ingestion.`,
      recordIds: [opportunity.id],
    });
  }

  return dealContextPackageSchema.parse({
    opportunity: toOpportunityContext(opportunity),
    account: toAccountContext(opportunity.account),
    contacts,
    crmSnapshot,
    sourceItems: sortedSourceItems,
    activityHistory,
    metadata: {
      opportunityId: opportunity.id,
      generatedAt,
      sourceItemCount: sortedSourceItems.length,
      excludedSourceItemCount: parsedSourceItems.length - visibleSourceItems.length,
      duplicateSourceItemCount: duplicateCount,
    },
    warnings,
  });
}

function toOpportunityContext(opportunity: Opportunity) {
  return {
    id: opportunity.id,
    accountId: opportunity.accountId,
    externalId: opportunity.externalId,
    name: opportunity.name,
    stage: opportunity.stage,
    forecastCategory: opportunity.forecastCategory,
    amount: opportunity.amount,
    closeDate: opportunity.closeDate,
    ownerName: opportunity.ownerName,
    description: opportunity.description,
    createdAt: opportunity.createdAt,
    updatedAt: opportunity.updatedAt,
  };
}

function toAccountContext(account: Account) {
  return {
    id: account.id,
    externalId: account.externalId,
    name: account.name,
    website: account.website,
    industry: account.industry,
    segment: account.segment,
    ownerName: account.ownerName,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

function toContactContext(link: OpportunityContactWithContact): ContactContext {
  return {
    id: link.contact.id,
    accountId: link.contact.accountId,
    externalId: link.contact.externalId,
    firstName: link.contact.firstName,
    lastName: link.contact.lastName,
    email: link.contact.email,
    title: link.contact.title,
    phone: link.contact.phone,
    createdAt: link.contact.createdAt,
    updatedAt: link.contact.updatedAt,
    opportunityRole: link.role,
    isPrimary: link.isPrimary,
  };
}

function parseSourceItem(sourceItem: SourceItem, warnings: IngestionWarning[]): ParsedSourceItem {
  const { metadata, metadataParseFailed } = parseSourceMetadata(sourceItem, warnings);

  if (!sourceItem.occurredAt) {
    warnings.push({
      code: "MISSING_SOURCE_TIMESTAMP",
      severity: "warning",
      message: `Source item ${sourceItem.id} has no occurredAt timestamp.`,
      recordIds: [sourceItem.id],
    });
  }

  if (!metadata.author) {
    warnings.push({
      code: "MISSING_SOURCE_AUTHOR_METADATA",
      severity: "warning",
      message: `Source item ${sourceItem.id} has no author metadata.`,
      recordIds: [sourceItem.id],
    });
  }

  const missingKeys = SOURCE_METADATA_REQUIRED_KEYS.filter((key) => metadata[key] === undefined);
  if (missingKeys.length > 0) {
    warnings.push({
      code: metadataParseFailed ? "UNSUPPORTED_SOURCE_METADATA" : "INCOMPLETE_SOURCE_METADATA",
      severity: "warning",
      message: `Source item ${sourceItem.id} has incomplete source metadata.`,
      recordIds: [sourceItem.id],
      details: { missingKeys },
    });
  }

  return {
    id: sourceItem.id,
    accountId: sourceItem.accountId,
    opportunityId: sourceItem.opportunityId,
    contactId: sourceItem.contactId,
    type: sourceItem.type,
    visibility: sourceItem.visibility,
    title: sourceItem.title,
    uri: sourceItem.uri,
    body: sourceItem.body,
    occurredAt: sourceItem.occurredAt,
    ingestedAt: sourceItem.ingestedAt,
    metadata,
    metadataParseFailed,
  };
}

function parseSourceMetadata(sourceItem: SourceItem, warnings: IngestionWarning[]): { metadata: SourceMetadata; metadataParseFailed: boolean } {
  if (!sourceItem.metadataJson) {
    return { metadata: {}, metadataParseFailed: false };
  }

  try {
    const raw = JSON.parse(sourceItem.metadataJson) as unknown;
    const parsed = sourceMetadataSchema.safeParse(raw);
    if (!parsed.success) {
      warnings.push({
        code: "UNSUPPORTED_SOURCE_METADATA",
        severity: "warning",
        message: `Source item ${sourceItem.id} has unsupported source metadata shape.`,
        recordIds: [sourceItem.id],
      });
      return { metadata: {}, metadataParseFailed: true };
    }

    return { metadata: parsed.data, metadataParseFailed: false };
  } catch {
    warnings.push({
      code: "UNPARSABLE_SOURCE_METADATA",
      severity: "warning",
      message: `Source item ${sourceItem.id} has metadata that is not valid JSON.`,
      recordIds: [sourceItem.id],
    });
    return { metadata: {}, metadataParseFailed: true };
  }
}

function filterSourceItems(sourceItems: ParsedSourceItem[], warnings: IngestionWarning[]): ParsedSourceItem[] {
  return sourceItems.filter((sourceItem) => {
    if (sourceItem.visibility === SourceVisibility.PRIVATE) {
      warnings.push({
        code: "PRIVATE_SOURCE_EXCLUDED",
        severity: "info",
        message: `Source item ${sourceItem.id} was excluded because it is private.`,
        recordIds: [sourceItem.id],
      });
      return false;
    }

    if (isUnauthorized(sourceItem.metadata)) {
      warnings.push({
        code: "UNAUTHORIZED_SOURCE_EXCLUDED",
        severity: "info",
        message: `Source item ${sourceItem.id} was excluded because metadata marks it unauthorized.`,
        recordIds: [sourceItem.id],
      });
      return false;
    }

    return true;
  });
}

function isUnauthorized(metadata: SourceMetadata): boolean {
  return metadata.authorized === false || metadata.authorization?.authorized === false;
}

function deduplicateSourceItems(sourceItems: ParsedSourceItem[], warnings: IngestionWarning[]): { sourceItems: SourceItemContext[]; duplicateCount: number } {
  const canonicalIds = new Set(sourceItems.map((sourceItem) => sourceItem.id));
  const duplicateIds = new Set<string>();
  const fallbackKeys = new Map<string, ParsedSourceItem>();

  for (const sourceItem of sortSourceItems(sourceItems)) {
    const duplicateOf = sourceItem.metadata.duplicateOf;
    if (duplicateOf && canonicalIds.has(duplicateOf)) {
      duplicateIds.add(sourceItem.id);
      warnings.push({
        code: "DUPLICATE_SOURCE_SUPPRESSED",
        severity: "info",
        message: `Source item ${sourceItem.id} was suppressed because it duplicates ${duplicateOf}.`,
        recordIds: [sourceItem.id, duplicateOf],
        details: { duplicateOf },
      });
      continue;
    }

    const fallbackKey = duplicateFallbackKey(sourceItem);
    const existing = fallbackKeys.get(fallbackKey);
    if (existing) {
      duplicateIds.add(sourceItem.id);
      warnings.push({
        code: "DUPLICATE_SOURCE_SUPPRESSED",
        severity: "info",
        message: `Source item ${sourceItem.id} was suppressed because it matches ${existing.id} by normalized content and timestamp.`,
        recordIds: [sourceItem.id, existing.id],
        details: { duplicateOf: existing.id, fallbackKey },
      });
      continue;
    }

    fallbackKeys.set(fallbackKey, sourceItem);
  }

  return {
    sourceItems: sourceItems.filter((sourceItem) => !duplicateIds.has(sourceItem.id)).map(stripParsedSourceItem),
    duplicateCount: duplicateIds.size,
  };
}

function stripParsedSourceItem(sourceItem: ParsedSourceItem): SourceItemContext {
  const { metadataParseFailed: _metadataParseFailed, ...context } = sourceItem;
  return context;
}

function duplicateFallbackKey(sourceItem: SourceItemContext): string {
  return [
    sourceItem.type,
    sourceItem.contactId ?? "",
    normalizeText(sourceItem.title),
    normalizeText(sourceItem.body ?? ""),
    sourceItem.occurredAt?.toISOString() ?? "",
  ].join("|");
}

function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function toActivityHistoryItem(sourceItem: SourceItemContext): ActivityHistoryItem {
  return {
    id: `activity:${sourceItem.id}`,
    sourceItemId: sourceItem.id,
    type: sourceItem.type,
    title: sourceItem.title,
    occurredAt: sourceItem.occurredAt,
    ingestedAt: sourceItem.ingestedAt,
    author: sourceItem.metadata.author ?? null,
    contactId: sourceItem.contactId,
    sourceSystem: sourceItem.metadata.sourceSystem ?? null,
    visibility: sourceItem.visibility,
  };
}

function sortContacts(contacts: ContactContext[]): ContactContext[] {
  return contacts.toSorted((left, right) => compareBooleanDesc(left.isPrimary, right.isPrimary) || compareNullableString(left.opportunityRole, right.opportunityRole) || compareNullableString(left.lastName, right.lastName) || compareNullableString(left.firstName, right.firstName) || compareNullableString(left.email, right.email) || left.id.localeCompare(right.id));
}

function sortCrmSnapshots(snapshots: CRMFieldSnapshot[]) {
  return snapshots.toSorted((left, right) => compareDateDesc(left.capturedAt, right.capturedAt) || left.fieldName.localeCompare(right.fieldName) || left.id.localeCompare(right.id));
}

function sortSourceItems<T extends SourceItemContext>(sourceItems: T[]): T[] {
  return sourceItems.toSorted((left, right) => compareDateDesc(left.occurredAt, right.occurredAt) || compareDateDesc(left.ingestedAt, right.ingestedAt) || left.id.localeCompare(right.id));
}

function sortActivityHistory(activityHistory: ActivityHistoryItem[]): ActivityHistoryItem[] {
  return activityHistory.toSorted((left, right) => compareDateDesc(left.occurredAt, right.occurredAt) || compareDateDesc(left.ingestedAt, right.ingestedAt) || left.sourceItemId.localeCompare(right.sourceItemId));
}

function compareBooleanDesc(left: boolean, right: boolean): number {
  return Number(right) - Number(left);
}

function compareNullableString(left: string | null, right: string | null): number {
  return (left ?? "").localeCompare(right ?? "");
}

function compareDateDesc(left: Date | null, right: Date | null): number {
  const leftTime = left?.getTime() ?? Number.NEGATIVE_INFINITY;
  const rightTime = right?.getTime() ?? Number.NEGATIVE_INFINITY;
  return rightTime - leftTime;
}

export { dealContextPackageSchema } from "./schemas";
export { OpportunityNotFoundError } from "./types";
export type { DealContextPackage, IngestionWarning, SourceMetadata } from "./types";
