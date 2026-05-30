import { ForecastCategory, SourceType, SourceVisibility } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { fixtures } from "../../prisma/seed";

const opportunityStages = [
  "PROSPECTING",
  "QUALIFICATION",
  "DISCOVERY",
  "PROPOSAL",
  "NEGOTIATION",
  "CLOSED_WON",
  "CLOSED_LOST",
] as const;

const forecastCategories = ["PIPELINE", "BEST_CASE", "COMMIT", "CLOSED", "OMITTED"] as const;

const sourceTypes = [
  SourceType.EMAIL,
  SourceType.MEETING_NOTE,
  SourceType.CALL_TRANSCRIPT,
  SourceType.DOCUMENT,
  SourceType.CRM_NOTE,
  SourceType.SUPPORT_TICKET,
  SourceType.WEB_PAGE,
  SourceType.OTHER,
] as const;

const sourceVisibilities = [
  SourceVisibility.PRIVATE,
  SourceVisibility.TEAM,
  SourceVisibility.INTERNAL,
  SourceVisibility.PUBLIC,
] as const;

const snapshotSchema = z.object({
  fieldName: z.string().min(1),
  fieldLabel: z.string().min(1),
  dataType: z.string().min(1),
  value: z.string(),
});

const contactSchema = z.object({
  externalId: z.string().regex(/^CON-\d{3}-[A-Z]$/),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  title: z.string().min(1),
  role: z.string().min(1),
  isPrimary: z.boolean().optional(),
});

const sourceSchema = z.object({
  externalId: z.string().regex(/^SRC-\d{3}-[A-Z]$/),
  type: z.enum(sourceTypes),
  visibility: z.enum(sourceVisibilities),
  title: z.string().min(1),
  author: z.string().min(1),
  body: z.string().min(1),
  occurredAt: z.date(),
  contactExternalId: z.string().regex(/^CON-\d{3}-[A-Z]$/).optional(),
  uri: z.string().min(1).optional(),
  authorized: z.boolean().optional(),
  authorizationScope: z.string().min(1).optional(),
  duplicateOf: z.string().regex(/^SRC-\d{3}-[A-Z]$/).optional(),
  matchedText: z.string().min(1).optional(),
});

const opportunityFixtureSchema = z.object({
  externalId: z.string().regex(/^OPP-\d{3}-[A-Z0-9-]+$/),
  account: z.object({
    externalId: z.string().regex(/^ACC-\d{3}$/),
    name: z.string().min(1),
    website: z.string().url(),
    industry: z.string().min(1),
    segment: z.string().min(1),
    ownerName: z.string().min(1),
  }),
  name: z.string().min(1),
  stage: z.enum(opportunityStages),
  forecastCategory: z.enum(forecastCategories),
  amount: z.number().positive(),
  closeDate: z.date(),
  ownerName: z.string().min(1),
  description: z.string().min(1),
  contacts: z.array(contactSchema),
  snapshots: z.array(snapshotSchema).min(1),
  sources: z.array(sourceSchema),
});

describe("Stage 1 seed fixture validation", () => {
  it("keeps schema-adjacent fixtures structurally valid", () => {
    expect(() => z.array(opportunityFixtureSchema).min(1).parse(fixtures)).not.toThrow();
  });

  it("populates required account, opportunity, contact, snapshot, and source fields", () => {
    for (const fixture of fixtures) {
      expect(fixture.externalId).toBeTruthy();
      expect(fixture.account.externalId).toBeTruthy();
      expect(fixture.account.name).toBeTruthy();
      expect(fixture.name).toBeTruthy();
      expect(fixture.ownerName).toBeTruthy();
      expect(fixture.description).toBeTruthy();
      expect(fixture.snapshots.length).toBeGreaterThan(0);

      for (const contact of fixture.contacts) {
        expect(contact.externalId).toBeTruthy();
        expect(contact.email).toContain("@");
        expect(contact.role).toBeTruthy();
      }

      for (const snapshot of fixture.snapshots) {
        expect(snapshot.fieldName).toBeTruthy();
        expect(snapshot.fieldLabel).toBeTruthy();
        expect(snapshot.dataType).toBeTruthy();
      }

      for (const source of fixture.sources) {
        expect(source.externalId).toBeTruthy();
        expect(source.title).toBeTruthy();
        expect(source.author).toBeTruthy();
        expect(source.body).toBeTruthy();
        expect(source.occurredAt).toBeInstanceOf(Date);
      }
    }
  });

  it("uses only declared enum values for opportunity and source fixtures", () => {
    expect(new Set(Object.values(ForecastCategory))).toEqual(new Set(forecastCategories));
    expect(new Set(Object.values(SourceType))).toEqual(new Set(sourceTypes));
    expect(new Set(Object.values(SourceVisibility))).toEqual(new Set(sourceVisibilities));

    for (const fixture of fixtures) {
      expect(opportunityStages).toContain(fixture.stage);
      expect(Object.values(ForecastCategory)).toContain(fixture.forecastCategory);

      for (const source of fixture.sources) {
        expect(Object.values(SourceType)).toContain(source.type);
        expect(Object.values(SourceVisibility)).toContain(source.visibility);
      }
    }
  });

  it("preserves relationship assumptions inside deterministic fixtures", () => {
    const opportunityIds = new Set<string>();
    const accountIds = new Set<string>();
    const sourceIds = new Set<string>();

    for (const fixture of fixtures) {
      expect(opportunityIds.has(fixture.externalId)).toBe(false);
      opportunityIds.add(fixture.externalId);

      expect(accountIds.has(fixture.account.externalId)).toBe(false);
      accountIds.add(fixture.account.externalId);

      const contactIds = new Set(fixture.contacts.map((contact) => contact.externalId));
      const primaryContacts = fixture.contacts.filter((contact) => contact.isPrimary);
      expect(primaryContacts.length).toBeLessThanOrEqual(1);

      for (const source of fixture.sources) {
        expect(sourceIds.has(source.externalId)).toBe(false);
        sourceIds.add(source.externalId);

        if (source.contactExternalId) {
          expect(contactIds.has(source.contactExternalId)).toBe(true);
        }

        if (source.duplicateOf) {
          expect(fixture.sources.map((candidate) => candidate.externalId)).toContain(source.duplicateOf);
        }
      }
    }
  });
});
