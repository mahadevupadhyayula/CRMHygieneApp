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
    accountId: null,
    opportunityId: null,
    contactId: null,
    visibility: SourceVisibility.TEAM,
    title: "Untitled source",
    body: "General customer note.",
    occurredAt: null,
    ingestedAt: now,
    metadata: {
      authorization: { authorized: true, scope: "team" },
    },
    ...overrides,
  };
}

function confidenceFor(source: MatchingSourceItem, candidate: MatchingOpportunity = opportunity()): number {
  return matchSourceToOpportunity(source, [candidate], { minimumMatchConfidence: 0 }).confidence;
}

describe("Deal-to-Source Matching Agent unit signals", () => {
  it("returns high confidence for a direct CRM relationship", () => {
    const match = matchSourceToOpportunity(sourceItem({ opportunityId: "opp-acme-expansion" }), [opportunity()]);

    expect(match.status).toBe("matched");
    expect(match.opportunityId).toBe("opp-acme-expansion");
    expect(match.confidence).toBeGreaterThanOrEqual(0.75);
    expect(match.reasons).toContain("Direct CRM relationship links the source item to this opportunity.");
    expect(sourceMatchSchema.safeParse(match).success).toBe(true);
  });

  it("returns high confidence for exact opportunity-name evidence", () => {
    const match = matchSourceToOpportunity(sourceItem({ title: "Project Falcon update", body: "Project Falcon procurement is ready." }), [opportunity({ name: "Project Falcon", accountName: "Acme Corp" })]);

    expect(match.status).toBe("matched");
    expect(match.opportunityId).toBe("opp-acme-expansion");
    expect(match.confidence).toBeGreaterThanOrEqual(0.72);
    expect(match.reasons).toContain("Exact opportunity name appears in the source item.");
  });

  it("keeps account-only references at medium confidence when no opportunity-specific signal exists", () => {
    const match = matchSourceToOpportunity(sourceItem({ title: "Acme Corp update", body: "Acme Corp asked for a next-step recap." }), [opportunity()]);

    expect(match.status).toBe("unmatched");
    expect(match.opportunityId).toBeNull();
    expect(match.confidence).toBeGreaterThanOrEqual(0.4);
    expect(match.confidence).toBeLessThan(0.62);
    expect(match.reasons).toContain("Account-only mention is capped at medium confidence without opportunity-specific signals.");
  });

  it("marks multiple active opportunities for the same account as ambiguous when the source cannot distinguish them", () => {
    const acmeRenewal = opportunity({
      id: "opp-acme-renewal",
      externalId: "OPP-ACME-002",
      name: "Acme Renewal",
      contacts: [{ id: "contact-sam", firstName: "Sam", lastName: "Green", email: "sam.green@acme.example" }],
    });

    const match = matchSourceToOpportunity(
      sourceItem({
        title: "Acme Corp legal thread",
        body: "legal@acme.example asked for updated terms.",
        metadata: { author: "Alex Rivera", ownerName: "Alex Rivera", authorization: { authorized: true, scope: "team" } },
        occurredAt: recent,
      }),
      [opportunity(), acmeRenewal],
    );

    expect(match.status).toBe("ambiguous");
    expect(match.opportunityId).toBeNull();
    expect(match.reasons.join(" ")).toContain("Preserved for review; do not use this source item for extraction until a human resolves the match.");
  });

  it("uses contact email domain evidence to improve confidence", () => {
    const baseline = confidenceFor(sourceItem({ title: "Procurement follow-up", body: "Procurement follow-up." }));
    const withDomain = matchSourceToOpportunity(sourceItem({ title: "Procurement follow-up", body: "procurement@acme.example asked about timing." }), [opportunity()], { minimumMatchConfidence: 0 });

    expect(withDomain.confidence).toBeGreaterThan(baseline);
    expect(withDomain.reasons).toContain("Contact email domain aligns with the opportunity account or contacts.");
  });

  it("uses contact name mentions to improve confidence", () => {
    const baseline = confidenceFor(sourceItem({ title: "Budget follow-up", body: "Budget follow-up." }));
    const withName = matchSourceToOpportunity(sourceItem({ title: "Budget follow-up", body: "Jordan Lee asked for timing." }), [opportunity()], { minimumMatchConfidence: 0 });

    expect(withName.confidence).toBeGreaterThan(baseline);
    expect(withName.reasons).toContain("A contact name associated with the opportunity appears in the source item.");
  });

  it("uses owner/team metadata to improve confidence", () => {
    const baseline = confidenceFor(sourceItem({ title: "Manager note", body: "Manager note." }));
    const withOwnerTeam = matchSourceToOpportunity(sourceItem({ title: "Manager note", body: "Manager note.", metadata: { author: "Alex Rivera", teamName: "Enterprise Sales", authorization: { authorized: true, scope: "team" } } }), [opportunity()], { minimumMatchConfidence: 0 });

    expect(withOwnerTeam.confidence).toBeGreaterThan(baseline);
    expect(withOwnerTeam.reasons).toContain("Owner or team metadata aligns with the opportunity owner/team.");
  });

  it("uses timestamp proximity to improve confidence", () => {
    const baseline = confidenceFor(sourceItem({ title: "Meeting note", body: "Meeting note.", occurredAt: old }));
    const withProximity = matchSourceToOpportunity(sourceItem({ title: "Meeting note", body: "Meeting note.", occurredAt: recent }), [opportunity()], { minimumMatchConfidence: 0 });

    expect(withProximity.confidence).toBeGreaterThan(baseline);
    expect(withProximity.reasons).toContain("Source timestamp is near opportunity activity or close-date context.");
  });

  it("uses keyword references to improve confidence", () => {
    const baseline = confidenceFor(sourceItem({ title: "Follow-up", body: "Follow-up." }));
    const withKeywords = matchSourceToOpportunity(sourceItem({ title: "Security review", body: "Procurement asked about the security review." }), [opportunity()], { minimumMatchConfidence: 0 });

    expect(withKeywords.confidence).toBeGreaterThan(baseline);
    expect(withKeywords.reasons).toContain("Keyword references matched: procurement, security review.");
  });

  it("lowers confidence for old unrelated notes", () => {
    const recentUnrelated = matchSourceToOpportunity(sourceItem({ title: "Generic note", body: "Generic note.", occurredAt: recent }), [opportunity()], { minimumMatchConfidence: 0, referenceDate: now });
    const oldUnrelated = matchSourceToOpportunity(sourceItem({ title: "Legacy note", body: "Old generic onboarding note with no relevant references.", occurredAt: old }), [opportunity()], { minimumMatchConfidence: 0, referenceDate: now });

    expect(oldUnrelated.confidence).toBeLessThan(recentUnrelated.confidence);
    expect(oldUnrelated.confidence).toBe(0);
    expect(oldUnrelated.reasons).toContain("Old source item lacks direct opportunity or account references, lowering confidence.");
  });

  it("never matches private or unauthorized sources", () => {
    const [privateMatch, unauthorizedMatch] = matchSourcesToOpportunities(
      [sourceItem({ id: "src-private", visibility: SourceVisibility.PRIVATE, opportunityId: "opp-acme-expansion" }), sourceItem({ id: "src-unauthorized", opportunityId: "opp-acme-expansion", metadata: { authorization: { authorized: false, scope: "private" } } })],
      [opportunity()],
    );

    expect(privateMatch).toMatchObject({ sourceItemId: "src-private", opportunityId: null, confidence: 0, status: "unmatched" });
    expect(unauthorizedMatch).toMatchObject({ sourceItemId: "src-unauthorized", opportunityId: null, confidence: 0, status: "unmatched" });
  });
});
