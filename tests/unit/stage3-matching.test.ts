import { SourceVisibility } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { matchSourceToOpportunity, matchSourcesToOpportunities, sourceMatchSchema, type MatchingOpportunity, type MatchingSourceItem } from "../../lib/agents/matching";

const now = new Date("2026-05-30T12:00:00.000Z");
const recent = new Date("2026-05-29T12:00:00.000Z");
const old = new Date("2025-05-29T12:00:00.000Z");

function opportunity(overrides: Partial<MatchingOpportunity> = {}): MatchingOpportunity {
  return {
    id: "opp-acme-expansion",
    externalId: "OPP-ACME-001",
    accountId: "acct-acme",
    accountName: "Acme Corp",
    accountWebsite: "https://acme.example",
    name: "Acme Expansion",
    ownerName: "Alex Rivera",
    teamNames: ["Enterprise Sales"],
    stage: "NEGOTIATION",
    isActive: true,
    createdAt: new Date("2026-04-30T12:00:00.000Z"),
    updatedAt: now,
    closeDate: new Date("2026-06-30T12:00:00.000Z"),
    contacts: [
      { id: "contact-jordan", firstName: "Jordan", lastName: "Lee", email: "jordan.lee@acme.example" },
      { id: "contact-priya", firstName: "Priya", lastName: "Shah", email: "priya.shah@acme.example" },
    ],
    keywords: ["procurement", "budget", "security review"],
    ...overrides,
  };
}

function sourceItem(overrides: Partial<MatchingSourceItem> = {}): MatchingSourceItem {
  return {
    id: "src-1",
    accountId: "acct-acme",
    opportunityId: null,
    contactId: null,
    visibility: SourceVisibility.TEAM,
    title: "Follow-up on Acme Expansion",
    body: "Jordan Lee confirmed procurement and budget next steps for Acme Expansion.",
    occurredAt: recent,
    ingestedAt: now,
    metadata: {
      author: "Alex Rivera",
      authorEmail: "alex.rivera@vendor.example",
      teamName: "Enterprise Sales",
      authorization: { authorized: true, scope: "team" },
    },
    ...overrides,
  };
}

describe("Deal-to-Source Matching Agent", () => {
  it("returns high confidence for a direct CRM relationship", () => {
    const match = matchSourceToOpportunity(sourceItem({ opportunityId: "opp-acme-expansion", title: "Internal note", body: "Brief update." }), [opportunity()]);

    expect(match.status).toBe("matched");
    expect(match.opportunityId).toBe("opp-acme-expansion");
    expect(match.confidence).toBeGreaterThanOrEqual(0.75);
    expect(match.reasons).toContain("Direct CRM relationship links the source item to this opportunity.");
    expect(sourceMatchSchema.safeParse(match).success).toBe(true);
  });

  it("returns high confidence for exact opportunity-name evidence", () => {
    const match = matchSourceToOpportunity(sourceItem({ title: "Acme Expansion procurement update", body: "Priya Shah sent notes from priya.shah@acme.example about budget approval." }), [opportunity()]);

    expect(match.status).toBe("matched");
    expect(match.opportunityId).toBe("opp-acme-expansion");
    expect(match.confidence).toBeGreaterThanOrEqual(0.8);
    expect(match.reasons).toContain("Exact opportunity name appears in the source item.");
  });

  it("keeps account-only references at medium confidence when no opportunity-specific signal exists", () => {
    const match = matchSourceToOpportunity(sourceItem({ title: "Acme Corp update", body: "Acme Corp asked for a next-step recap.", metadata: { authorization: { authorized: true } } }), [opportunity()]);

    expect(match.status).toBe("unmatched");
    expect(match.opportunityId).toBeNull();
    expect(match.confidence).toBeLessThan(0.62);
    expect(match.reasons).toContain("Account-only mention is capped at medium confidence without opportunity-specific signals.");
  });

  it("marks close competing account-only opportunities as ambiguous and does not attach an opportunity", () => {
    const secondOpportunity = opportunity({
      id: "opp-acme-renewal",
      externalId: "OPP-ACME-002",
      name: "Acme Renewal",
      contacts: [{ id: "contact-sam", firstName: "Sam", lastName: "Green", email: "sam.green@acme.example" }],
    });
    const match = matchSourceToOpportunity(
      sourceItem({ title: "Acme Corp legal thread", body: "legal@acme.example asked Alex Rivera for updated terms.", metadata: { author: "Alex Rivera", ownerName: "Alex Rivera", authorization: { authorized: true } } }),
      [opportunity(), secondOpportunity],
    );

    expect(match.status).toBe("ambiguous");
    expect(match.opportunityId).toBeNull();
    expect(match.reasons.join(" ")).toContain("Preserved for review; do not use this source item for extraction until a human resolves the match.");
  });

  it("uses contact domain, contact name, owner/team, timestamp, and keyword signals to improve confidence", () => {
    const match = matchSourceToOpportunity(sourceItem({ title: "Procurement follow-up", body: "Jordan Lee at jordan.lee@acme.example confirmed procurement timing.", metadata: { author: "Alex Rivera", teamName: "Enterprise Sales", authorization: { authorized: true } } }), [opportunity()]);

    expect(match.status).toBe("matched");
    expect(match.confidence).toBeGreaterThanOrEqual(0.62);
    expect(match.reasons).toEqual(expect.arrayContaining(["Contact email domain aligns with the opportunity account or contacts.", "A contact name associated with the opportunity appears in the source item.", "Owner or team metadata aligns with the opportunity owner/team.", "Source timestamp is near opportunity activity or close-date context."]));
  });

  it("lowers confidence for old unrelated notes", () => {
    const match = matchSourceToOpportunity(sourceItem({ title: "Legacy note", body: "Old generic onboarding note with no relevant references.", occurredAt: old, metadata: { authorization: { authorized: true } } }), [opportunity()], { referenceDate: now });

    expect(match.status).toBe("unmatched");
    expect(match.confidence).toBe(0);
    expect(match.reasons).toContain("Old source item lacks direct opportunity or account references, lowering confidence.");
  });

  it("never matches private or unauthorized sources", () => {
    const [privateMatch, unauthorizedMatch] = matchSourcesToOpportunities(
      [sourceItem({ id: "src-private", visibility: SourceVisibility.PRIVATE }), sourceItem({ id: "src-unauthorized", metadata: { authorization: { authorized: false, scope: "private" } } })],
      [opportunity()],
    );

    expect(privateMatch).toMatchObject({ sourceItemId: "src-private", opportunityId: null, confidence: 0, status: "unmatched" });
    expect(unauthorizedMatch).toMatchObject({ sourceItemId: "src-unauthorized", opportunityId: null, confidence: 0, status: "unmatched" });
  });
});
