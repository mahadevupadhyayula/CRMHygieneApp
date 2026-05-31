import { crmPageSchema, crmSnapshotSchema } from "./schemas";
import type {
  CrmObjectType,
  CrmSnapshot,
  CrmSyncLog,
  HubSpotPage,
  HubSpotRawObject,
  HubSpotReadOnlyClient,
  HubSpotSyncOptions,
  NormalizedCrmActivity,
  NormalizedCrmFieldSnapshot,
} from "./types";
import { CrmIntegrationError } from "./types";

export * from "./schemas";
export * from "./types";

const OBJECT_TYPES: CrmObjectType[] = ["owners", "companies", "contacts", "deals", "notes", "tasks", "emails"];
const DEFAULT_DEAL_FIELDS = ["dealname", "amount", "dealstage", "pipeline", "closedate", "hubspot_owner_id", "associatedcompanyid"];
const DEFAULT_REQUIRED_FIELDS: Required<NonNullable<HubSpotSyncOptions["requiredFields"]>> = {
  owners: [],
  companies: ["name"],
  contacts: [],
  deals: ["dealname"],
  notes: [],
  tasks: [],
  emails: [],
};

export async function syncHubSpotReadOnly(client: HubSpotReadOnlyClient, options: HubSpotSyncOptions = {}): Promise<CrmSnapshot> {
  const now = options.now ?? new Date();
  const logs: CrmSyncLog[] = [];
  const raw = new Map<CrmObjectType, HubSpotRawObject[]>();

  for (const objectType of OBJECT_TYPES) {
    try {
      raw.set(objectType, await fetchAllPages(client, objectType, options));
    } catch (error) {
      logs.push(toLog(error, objectType, now));
      logs.push({ level: "error", code: "PARTIAL_SYNC_FAILURE", message: `Failed to sync ${objectType}; continuing with other read-only objects.`, objectType, createdAt: now });
      raw.set(objectType, []);
      if (options.continueOnError === false) throw error;
    }
  }

  const seen = new Set<string>();
  const dedupe = (objectType: CrmObjectType, records: HubSpotRawObject[]) => records.filter((record) => {
    const key = `${objectType}:${record.id}`;
    if (seen.has(key)) {
      logs.push({ level: "warning", code: "DUPLICATE_RECORD", message: `Duplicate ${objectType} record ${record.id} was skipped.`, objectType, recordId: record.id, createdAt: now });
      return false;
    }
    seen.add(key);
    return true;
  });

  const rawOwners = dedupe("owners", raw.get("owners") ?? []);
  const rawCompanies = dedupe("companies", raw.get("companies") ?? []);
  const rawContacts = dedupe("contacts", raw.get("contacts") ?? []);
  const rawDeals = dedupe("deals", raw.get("deals") ?? []);
  const rawNotes = dedupe("notes", raw.get("notes") ?? []);
  const rawTasks = dedupe("tasks", raw.get("tasks") ?? []);
  const rawEmails = dedupe("emails", raw.get("emails") ?? []);

  const owners = rawOwners.map((owner) => mapOwner(owner));
  const accounts = rawCompanies.map((company) => mapCompany(company, now, options, logs));
  const contacts = rawContacts.map((contact) => mapContact(contact, now, options, logs));
  const deals = rawDeals.map((deal) => mapDeal(deal, now, options, logs));
  const notes = rawNotes.map((note) => mapActivity("note", note, now, options, logs));
  const tasks = rawTasks.map((task) => mapActivity("task", task, now, options, logs));
  const emailActivities = rawEmails.map((email) => mapActivity("email", email, now, options, logs));
  const fieldSnapshots = rawDeals.flatMap((deal) => mapDealFieldSnapshots(deal, now, options, logs));

  return crmSnapshotSchema.parse({
    provider: "hubspot",
    capturedAt: now,
    readOnly: true,
    accounts,
    contacts,
    deals,
    notes,
    tasks,
    emailActivities,
    owners,
    fieldSnapshots,
    logs,
  });
}

export function createReadOnlyHubSpotClient(client: HubSpotReadOnlyClient): HubSpotReadOnlyClient {
  return {
    listObjects: (input) => client.listObjects(input),
    writeObject: async () => {
      throw new CrmIntegrationError("READ_ONLY_WRITE_FORBIDDEN", "HubSpot integration is read-only; live CRM writeback is disabled.");
    },
  };
}

async function fetchAllPages(client: HubSpotReadOnlyClient, objectType: CrmObjectType, options: HubSpotSyncOptions): Promise<HubSpotRawObject[]> {
  const all: HubSpotRawObject[] = [];
  let after: string | undefined;
  do {
    const page = crmPageSchema.parse(await client.listObjects({ objectType, after, limit: options.pageSize ?? 100 }));
    all.push(...page.results);
    after = page.paging?.next?.after;
  } while (after);
  return all;
}

function mapOwner(record: HubSpotRawObject) {
  const props = record.properties;
  const firstName = stringOrNull(props.firstName ?? props.firstname);
  const lastName = stringOrNull(props.lastName ?? props.lastname);
  const email = stringOrNull(props.email);
  return {
    id: `hubspot-owner-${record.id}`,
    provider: "hubspot" as const,
    externalId: record.id,
    email,
    firstName,
    lastName,
    name: [firstName, lastName].filter(Boolean).join(" ") || email || record.id,
    archived: Boolean(record.archived),
    raw: props,
  };
}

function mapCompany(record: HubSpotRawObject, now: Date, options: HubSpotSyncOptions, logs: CrmSyncLog[]) {
  requireFields("companies", record, now, options, logs);
  logDeleted("companies", record, now, logs);
  return {
    id: `hubspot-company-${record.id}`,
    provider: "hubspot" as const,
    externalId: record.id,
    name: stringOrNull(record.properties.name) ?? "Unnamed company",
    website: stringOrNull(record.properties.website ?? record.properties.domain),
    industry: stringOrNull(record.properties.industry),
    ownerExternalId: stringOrNull(record.properties.hubspot_owner_id),
    deleted: Boolean(record.archived),
    updatedAt: dateOrNull(record.properties.hs_lastmodifieddate ?? record.updatedAt),
    raw: record.properties,
  };
}

function mapContact(record: HubSpotRawObject, now: Date, options: HubSpotSyncOptions, logs: CrmSyncLog[]) {
  requireFields("contacts", record, now, options, logs);
  logDeleted("contacts", record, now, logs);
  return {
    id: `hubspot-contact-${record.id}`,
    provider: "hubspot" as const,
    externalId: record.id,
    accountExternalId: stringOrNull(record.properties.associatedcompanyid ?? record.properties.company_id),
    firstName: stringOrNull(record.properties.firstname),
    lastName: stringOrNull(record.properties.lastname),
    email: stringOrNull(record.properties.email),
    title: stringOrNull(record.properties.jobtitle),
    phone: stringOrNull(record.properties.phone),
    ownerExternalId: stringOrNull(record.properties.hubspot_owner_id),
    deleted: Boolean(record.archived),
    updatedAt: dateOrNull(record.properties.lastmodifieddate ?? record.properties.hs_lastmodifieddate ?? record.updatedAt),
    raw: record.properties,
  };
}

function mapDeal(record: HubSpotRawObject, now: Date, options: HubSpotSyncOptions, logs: CrmSyncLog[]) {
  requireFields("deals", record, now, options, logs);
  logDeleted("deals", record, now, logs);
  return {
    id: `hubspot-deal-${record.id}`,
    provider: "hubspot" as const,
    externalId: record.id,
    accountExternalId: stringOrNull(record.properties.associatedcompanyid ?? record.properties.company_id),
    name: stringOrNull(record.properties.dealname) ?? "Unnamed deal",
    stage: stringOrNull(record.properties.dealstage),
    pipeline: stringOrNull(record.properties.pipeline),
    amount: numberOrNull(record.properties.amount, "deals", record.id, "amount", now, logs),
    closeDate: dateOrNull(record.properties.closedate),
    ownerExternalId: stringOrNull(record.properties.hubspot_owner_id),
    deleted: Boolean(record.archived),
    updatedAt: dateOrNull(record.properties.hs_lastmodifieddate ?? record.updatedAt),
    raw: record.properties,
  };
}

function mapActivity(activityType: "note" | "task" | "email", record: HubSpotRawObject, now: Date, options: HubSpotSyncOptions, logs: CrmSyncLog[]): NormalizedCrmActivity {
  const objectType = activityType === "note" ? "notes" : activityType === "task" ? "tasks" : "emails";
  requireFields(objectType, record, now, options, logs);
  logDeleted(objectType, record, now, logs);
  const body = stringOrNull(record.properties.hs_note_body ?? record.properties.hs_task_body ?? record.properties.hs_email_text ?? record.properties.hs_email_html);
  return {
    id: `hubspot-${activityType}-${record.id}`,
    provider: "hubspot",
    externalId: record.id,
    activityType,
    accountExternalId: stringOrNull(record.properties.associatedcompanyid ?? record.properties.company_id),
    dealExternalId: stringOrNull(record.properties.associateddealid ?? record.properties.deal_id),
    contactExternalId: stringOrNull(record.properties.associatedcontactid ?? record.properties.contact_id),
    ownerExternalId: stringOrNull(record.properties.hubspot_owner_id),
    title: stringOrNull(record.properties.hs_task_subject ?? record.properties.hs_email_subject) ?? `${activityType} ${record.id}`,
    body,
    status: stringOrNull(record.properties.hs_task_status ?? record.properties.hs_email_status),
    occurredAt: dateOrNull(record.properties.hs_timestamp ?? record.properties.createdate ?? record.createdAt),
    deleted: Boolean(record.archived),
    raw: record.properties,
  };
}

function mapDealFieldSnapshots(record: HubSpotRawObject, now: Date, options: HubSpotSyncOptions, logs: CrmSyncLog[]): NormalizedCrmFieldSnapshot[] {
  const fields = options.selectedDealFields ?? DEFAULT_DEAL_FIELDS;
  return fields.flatMap((fieldName) => {
    if (!(fieldName in record.properties)) {
      logs.push({ level: "warning", code: "MISSING_FIELD", message: `Deal ${record.id} is missing selected field ${fieldName}.`, objectType: "deals", recordId: record.id, details: { fieldName }, createdAt: now });
      return [];
    }
    const rawValue = record.properties[fieldName];
    validateExpectedType("deals", record.id, fieldName, rawValue, now, options, logs);
    return [{
      id: `hubspot-deal-${record.id}-${fieldName}-${now.toISOString()}`,
      provider: "hubspot" as const,
      objectType: "deals" as const,
      objectId: record.id,
      fieldName,
      fieldLabel: options.fieldLabels?.[fieldName] ?? null,
      dataType: options.fieldTypes?.[fieldName] ?? null,
      value: rawValue == null ? null : String(rawValue),
      capturedAt: now,
    }];
  });
}

function requireFields(objectType: CrmObjectType, record: HubSpotRawObject, now: Date, options: HubSpotSyncOptions, logs: CrmSyncLog[]) {
  const required = [...(DEFAULT_REQUIRED_FIELDS[objectType] ?? []), ...(options.requiredFields?.[objectType] ?? [])];
  for (const fieldName of required) {
    if (!(fieldName in record.properties) || record.properties[fieldName] == null || record.properties[fieldName] === "") {
      logs.push({ level: "warning", code: "MISSING_FIELD", message: `${objectType} record ${record.id} is missing field ${fieldName}.`, objectType, recordId: record.id, details: { fieldName }, createdAt: now });
    }
  }
}

function validateExpectedType(objectType: CrmObjectType, recordId: string, fieldName: string, value: unknown, now: Date, options: HubSpotSyncOptions, logs: CrmSyncLog[]) {
  const expected = options.expectedFieldTypes?.[fieldName];
  if (!expected || value == null) return;
  const valid = expected === "date" ? dateOrNull(value) !== null : expected === "number" ? value !== "" && Number.isFinite(Number(value)) : expected === "boolean" ? typeof value === "boolean" || value === "true" || value === "false" : typeof value === "string";
  if (!valid) logs.push({ level: "warning", code: "FIELD_TYPE_MISMATCH", message: `${objectType} record ${recordId} field ${fieldName} does not match expected ${expected}.`, objectType, recordId, details: { fieldName, expected, actualValue: value }, createdAt: now });
}

function logDeleted(objectType: CrmObjectType, record: HubSpotRawObject, now: Date, logs: CrmSyncLog[]) {
  if (record.archived) logs.push({ level: "info", code: "DELETED_RECORD", message: `${objectType} record ${record.id} is archived in HubSpot.`, objectType, recordId: record.id, createdAt: now });
}

function stringOrNull(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

function numberOrNull(value: unknown, objectType: CrmObjectType, recordId: string, fieldName: string, now: Date, logs: CrmSyncLog[]): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    logs.push({ level: "warning", code: "FIELD_TYPE_MISMATCH", message: `${objectType} record ${recordId} field ${fieldName} could not be parsed as a number.`, objectType, recordId, details: { fieldName, actualValue: value }, createdAt: now });
    return null;
  }
  return parsed;
}

function dateOrNull(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toLog(error: unknown, objectType: CrmObjectType, now: Date): CrmSyncLog {
  if (error instanceof CrmIntegrationError) return { level: "error", code: error.code, message: error.message, objectType: error.objectType ?? objectType, details: error.retryAfterMs ? { retryAfterMs: error.retryAfterMs } : undefined, createdAt: now };
  return { level: "error", code: "API_ERROR", message: error instanceof Error ? error.message : "Unknown CRM API error.", objectType, createdAt: now };
}

export function hubSpotPage(results: HubSpotRawObject[], after?: string): HubSpotPage {
  return { results, paging: after ? { next: { after } } : undefined };
}
