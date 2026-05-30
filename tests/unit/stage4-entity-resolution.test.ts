import { describe, expect, it } from "vitest";

import { resolveEntities, resolveEntitiesFromText, resolvedEntitySchema, type EntityResolutionContext } from "../../lib/agents/entity-resolution";

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

describe("Entity Resolution Agent", () => {
  it("extracts deterministic CRM, stakeholder, document, date, amount, and risk entities", () => {
    const entities = resolveEntities(context);

    expect(entities.every((entity) => resolvedEntitySchema.safeParse(entity).success)).toBe(true);
    expect(entities).toEqual(expect.arrayContaining([expect.objectContaining({ entityType: "account", rawText: "Acme Corp", normalizedValue: "ACME" })]));
    expect(entities).toEqual(expect.arrayContaining([expect.objectContaining({ entityType: "opportunity", rawText: "Acme Expansion", normalizedValue: "OPP-001" })]));
    expect(entities).toEqual(expect.arrayContaining([expect.objectContaining({ entityType: "contact", rawText: "Jordan Lee", normalizedValue: "C-001" })]));
    expect(entities).toEqual(expect.arrayContaining([expect.objectContaining({ entityType: "role", rawText: "procurement", normalizedValue: "procurement" })]));
    expect(entities).toEqual(expect.arrayContaining([expect.objectContaining({ entityType: "internal owner", rawText: "internal finance", normalizedValue: "internal finance" })]));
    expect(entities).toEqual(expect.arrayContaining([expect.objectContaining({ entityType: "document", rawText: "MSA", normalizedValue: "MSA" })]));
    expect(entities).toEqual(expect.arrayContaining([expect.objectContaining({ entityType: "date", rawText: "next Friday", normalizedValue: "2026-05-29" })]));
    expect(entities).toEqual(expect.arrayContaining([expect.objectContaining({ entityType: "amount", rawText: "$125,000", normalizedValue: "USD 125,000" })]));
    expect(entities).toEqual(expect.arrayContaining([expect.objectContaining({ entityType: "amount", rawText: "18% discount", normalizedValue: "18% discount" })]));
    expect(entities).toEqual(expect.arrayContaining([expect.objectContaining({ entityType: "risk keyword", rawText: "blocked", normalizedValue: "blocked" })]));
  });

  it("lowers confidence for ambiguous pronouns and relative dates without a timestamp", () => {
    const entities = resolveEntitiesFromText("They need approval soon and legal may respond by end of quarter.");

    const pronoun = entities.find((entity) => entity.rawText === "They");
    const soon = entities.find((entity) => entity.rawText === "soon");
    const quarter = entities.find((entity) => entity.rawText === "end of quarter");

    expect(pronoun?.entityType).toBe("role");
    expect(pronoun?.confidence).toBeLessThan(0.5);
    expect(soon?.entityType).toBe("date");
    expect(soon?.confidence).toBeLessThan(0.5);
    expect(quarter?.normalizedValue).toContain("ambiguous relative date");
    expect(quarter?.confidence).toBeLessThan(0.5);
  });
});
