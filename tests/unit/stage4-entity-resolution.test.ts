import { describe, expect, it } from "vitest";

import { resolveEntities, resolveEntitiesFromText, resolvedEntitySchema, type EntityResolutionContext, type ResolvedEntity } from "../../lib/agents/entity-resolution";

const context: EntityResolutionContext = {
  account: { id: "acct-acme", externalId: "ACME", name: "Acme Corp" },
  opportunity: { id: "opp-expansion", externalId: "OPP-001", name: "Acme Expansion" },
  contacts: [
    { id: "contact-jordan", externalId: "C-001", firstName: "Jordan", lastName: "Lee", email: "jordan.lee@acme.example", title: "VP Finance" },
    { id: "contact-priya", externalId: "C-002", firstName: "Priya", lastName: "Shah", email: "priya.shah@acme.example", title: "Security" },
  ],
  sourceItems: [
    {
      id: "src-1",
      title: "Acme Corp Acme Expansion legal update",
      body: "Jordan Lee said procurement is blocked pending MSA and security questionnaire. internal finance and SE need the order form by next Friday. Pricing is $125,000 with 18% discount.",
      occurredAt: new Date("2026-05-25T12:00:00.000Z"),
      ingestedAt: new Date("2026-05-25T12:00:00.000Z"),
      metadata: {},
    },
  ],
};

function findEntity(entities: ResolvedEntity[], partial: Partial<ResolvedEntity>): ResolvedEntity | undefined {
  return entities.find((entity) => Object.entries(partial).every(([key, value]) => entity[key as keyof ResolvedEntity] === value));
}

function expectEntity(entities: ResolvedEntity[], partial: Partial<ResolvedEntity>) {
  expect(entities).toEqual(expect.arrayContaining([expect.objectContaining(partial)]));
}

describe("Entity Resolution Agent", () => {
  it("extracts deterministic CRM, stakeholder, document, date, amount, and risk entities", () => {
    const entities = resolveEntities(context);

    expect(entities.every((entity) => resolvedEntitySchema.safeParse(entity).success)).toBe(true);
    expectEntity(entities, { entityType: "account", rawText: "Acme Corp", normalizedValue: "ACME" });
    expectEntity(entities, { entityType: "opportunity", rawText: "Acme Expansion", normalizedValue: "OPP-001" });
    expectEntity(entities, { entityType: "contact", rawText: "Jordan Lee", normalizedValue: "C-001" });
    expectEntity(entities, { entityType: "role", rawText: "procurement", normalizedValue: "procurement" });
    expectEntity(entities, { entityType: "internal owner", rawText: "internal finance", normalizedValue: "internal finance" });
    expectEntity(entities, { entityType: "document", rawText: "MSA", normalizedValue: "MSA" });
    expectEntity(entities, { entityType: "date", rawText: "next Friday", normalizedValue: "2026-05-29" });
    expectEntity(entities, { entityType: "amount", rawText: "$125,000", normalizedValue: "USD 125,000" });
    expectEntity(entities, { entityType: "amount", rawText: "18% discount", normalizedValue: "18% discount" });
    expectEntity(entities, { entityType: "risk keyword", rawText: "blocked", normalizedValue: "blocked" });
  });

  it("identifies named contacts from full names, unique first names, and email addresses", () => {
    const entities = resolveEntitiesFromText("Jordan Lee met Priya and asked priya.shah@acme.example to send the recap.", { contacts: context.contacts });

    expectEntity(entities, { entityType: "contact", rawText: "Jordan Lee", normalizedValue: "C-001" });
    expectEntity(entities, { entityType: "contact", rawText: "Priya", normalizedValue: "C-002" });
    expectEntity(entities, { entityType: "contact", rawText: "priya.shah@acme.example", normalizedValue: "C-002" });
  });

  it("identifies role-only stakeholders when no person name is present", () => {
    const entities = resolveEntitiesFromText("CFO approval required before procurement signs.");

    expectEntity(entities, { entityType: "role", rawText: "CFO", normalizedValue: "Chief Financial Officer" });
    expectEntity(entities, { entityType: "role", rawText: "procurement", normalizedValue: "procurement" });
    expect(entities.some((entity) => entity.entityType === "contact")).toBe(false);
  });

  it("distinguishes customer stakeholders from internal owners", () => {
    const entities = resolveEntitiesFromText("Priya from finance is waiting on internal finance and deal desk.", { contacts: context.contacts });

    expectEntity(entities, { entityType: "contact", rawText: "Priya", normalizedValue: "C-002" });
    expectEntity(entities, { entityType: "internal owner", rawText: "internal finance", normalizedValue: "internal finance" });
    expectEntity(entities, { entityType: "internal owner", rawText: "deal desk", normalizedValue: "deal desk" });
    expect(findEntity(entities, { entityType: "internal owner", rawText: "Priya" })).toBeUndefined();
  });

  it("normalizes absolute and relative dates", () => {
    const entities = resolveEntities({ sourceItems: [{ id: "src-dates", body: "Follow up on 2026-06-02 and next Friday.", occurredAt: new Date("2026-05-30T09:00:00.000Z") }] });

    expectEntity(entities, { entityType: "date", rawText: "2026-06-02", normalizedValue: "2026-06-02" });
    expectEntity(entities, { entityType: "date", rawText: "next Friday", normalizedValue: "2026-06-05" });
  });

  it("flags ambiguous dates when source timing is unavailable", () => {
    const entities = resolveEntitiesFromText("Need approval soon and legal review by end of quarter.");
    const soon = findEntity(entities, { entityType: "date", rawText: "soon" });
    const quarter = findEntity(entities, { entityType: "date", rawText: "end of quarter" });

    expect(soon).toMatchObject({ normalizedValue: "ambiguous relative date: soon" });
    expect(soon?.confidence).toBeLessThan(0.5);
    expect(quarter?.normalizedValue).toContain("ambiguous relative date");
    expect(quarter?.confidence).toBeLessThan(0.5);
  });

  it("extracts competitor names", () => {
    const entities = resolveEntitiesFromText("Procurement said we are competing with DataDog and versus ServiceNow in the shortlist.");

    expectEntity(entities, { entityType: "competitor", rawText: "competing with DataDog", normalizedValue: "DataDog" });
    expectEntity(entities, { entityType: "competitor", rawText: "versus ServiceNow", normalizedValue: "ServiceNow" });
  });

  it("extracts document references such as MSA, DPA, and security questionnaire", () => {
    const entities = resolveEntitiesFromText("Legal requested the MSA, DPA, security questionnaire, and order form.");

    expectEntity(entities, { entityType: "document", rawText: "MSA", normalizedValue: "MSA" });
    expectEntity(entities, { entityType: "document", rawText: "DPA", normalizedValue: "DPA" });
    expectEntity(entities, { entityType: "document", rawText: "security questionnaire", normalizedValue: "security questionnaire" });
    expectEntity(entities, { entityType: "document", rawText: "order form", normalizedValue: "order form" });
  });

  it("extracts pricing and discount mentions", () => {
    const entities = resolveEntitiesFromText("Pricing is USD 125,000 and we offered an 18% discount with 2% uplift.");

    expectEntity(entities, { entityType: "amount", rawText: "USD 125,000", normalizedValue: "USD 125,000" });
    expectEntity(entities, { entityType: "amount", rawText: "18% discount", normalizedValue: "18% discount" });
    expectEntity(entities, { entityType: "amount", rawText: "2% uplift", normalizedValue: "2% uplift" });
  });

  it("lowers confidence for ambiguous pronouns and relative dates without a timestamp", () => {
    const entities = resolveEntitiesFromText("They need approval soon and legal may respond by end of quarter.");

    const pronoun = findEntity(entities, { rawText: "They" });
    const soon = findEntity(entities, { rawText: "soon" });
    const quarter = findEntity(entities, { rawText: "end of quarter" });

    expect(pronoun?.entityType).toBe("role");
    expect(pronoun?.confidence).toBeLessThan(0.5);
    expect(soon?.entityType).toBe("date");
    expect(soon?.confidence).toBeLessThan(0.5);
    expect(quarter?.normalizedValue).toContain("ambiguous relative date");
    expect(quarter?.confidence).toBeLessThan(0.5);
  });
});

describe("Entity Resolution Agent edge cases", () => {
  it("captures CFO approval required without inventing a contact name", () => {
    const entities = resolveEntitiesFromText("CFO approval required.");

    expectEntity(entities, { entityType: "role", rawText: "CFO", normalizedValue: "Chief Financial Officer" });
    expect(entities.some((entity) => entity.entityType === "contact")).toBe(false);
  });

  it("separates Priya from finance from internal finance", () => {
    const entities = resolveEntitiesFromText("Priya from finance needs the spreadsheet; internal finance owns the quote approval.", { contacts: context.contacts });

    expectEntity(entities, { entityType: "contact", rawText: "Priya", normalizedValue: "C-002" });
    expectEntity(entities, { entityType: "internal owner", rawText: "internal finance", normalizedValue: "internal finance" });
    expect(findEntity(entities, { entityType: "internal owner", rawText: "finance" })).toBeUndefined();
  });

  it("resolves next Friday with a known source timestamp", () => {
    const entities = resolveEntities({ sourceItems: [{ id: "src-next-friday", body: "Signature target is next Friday.", occurredAt: new Date("2026-05-26T14:30:00.000Z") }] });

    expectEntity(entities, { entityType: "date", rawText: "next Friday", normalizedValue: "2026-05-29" });
  });

  it("normalizes end of quarter when anchored and marks it ambiguous when unanchored", () => {
    const anchored = resolveEntities({ sourceItems: [{ id: "src-eoq", body: "Close by end of quarter.", occurredAt: new Date("2026-05-30T12:00:00.000Z") }] });
    const unanchored = resolveEntitiesFromText("Close by end of quarter.");

    expectEntity(anchored, { entityType: "date", rawText: "end of quarter", normalizedValue: "2026-06-30" });
    expect(findEntity(unanchored, { entityType: "date", rawText: "end of quarter" })?.confidence).toBeLessThan(0.5);
  });

  it("extracts an 18% discount", () => {
    const entities = resolveEntitiesFromText("Commercial ask: 18% discount.");

    expectEntity(entities, { entityType: "amount", rawText: "18% discount", normalizedValue: "18% discount" });
  });

  it("treats SAP connector as a product/module instead of a competitor", () => {
    const entities = resolveEntitiesFromText("Customer asked about the SAP connector.");

    expectEntity(entities, { entityType: "product/module", rawText: "SAP connector", normalizedValue: "SAP" });
    expect(entities.some((entity) => entity.entityType === "competitor" && entity.normalizedValue === "SAP connector")).toBe(false);
  });

  it("extracts multiple stakeholders in one note", () => {
    const entities = resolveEntitiesFromText("Jordan Lee, Priya, CFO, procurement, and internal finance joined the escalation.", { contacts: context.contacts });

    expectEntity(entities, { entityType: "contact", rawText: "Jordan Lee", normalizedValue: "C-001" });
    expectEntity(entities, { entityType: "contact", rawText: "Priya", normalizedValue: "C-002" });
    expectEntity(entities, { entityType: "role", rawText: "CFO", normalizedValue: "Chief Financial Officer" });
    expectEntity(entities, { entityType: "role", rawText: "procurement", normalizedValue: "procurement" });
    expectEntity(entities, { entityType: "internal owner", rawText: "internal finance", normalizedValue: "internal finance" });
  });

  it("preserves the same person with multiple role signals", () => {
    const entities = resolveEntitiesFromText("Jordan Lee is the CFO and legal sponsor for the deal.", { contacts: context.contacts });

    expectEntity(entities, { entityType: "contact", rawText: "Jordan Lee", normalizedValue: "C-001" });
    expectEntity(entities, { entityType: "role", rawText: "CFO", normalizedValue: "Chief Financial Officer" });
    expectEntity(entities, { entityType: "role", rawText: "legal", normalizedValue: "legal" });
  });

  it("flags ambiguous pronouns as unresolved low-confidence stakeholders", () => {
    const entities = resolveEntitiesFromText("They said their approver may push the date.");

    expect(findEntity(entities, { entityType: "role", rawText: "They" })?.confidence).toBeLessThan(0.5);
    expect(findEntity(entities, { entityType: "role", rawText: "their" })?.normalizedValue).toBe("ambiguous pronoun");
    expect(findEntity(entities, { entityType: "role", rawText: "approver" })?.normalizedValue).toBe("unresolved stakeholder");
  });
});
