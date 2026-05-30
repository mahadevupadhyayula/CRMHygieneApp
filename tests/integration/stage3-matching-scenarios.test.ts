import { SourceVisibility } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { matchSourceToOpportunity, type MatchingOpportunity, type MatchingSourceItem, type SourceMatch } from "../../lib/agents/matching";

const now = new Date("2026-05-30T12:00:00.000Z");
const recent = new Date("2026-05-28T12:00:00.000Z");

function opportunity(overrides: Partial<MatchingOpportunity> = {}): MatchingOpportunity {
  return {
    id: "opp-acme-expansion",
    externalId: "OPP-ACME-EXPANSION",
    accountId: "acct-acme",
    accountName: "Acme",
    accountWebsite: "https://acme.example",
    name: "Acme Expansion",
    ownerName: "Alex Rivera",
    teamNames: ["Enterprise Sales"],
    stage: "NEGOTIATION",
    isActive: true,
    createdAt: new Date("2026-04-15T12:00:00.000Z"),
    updatedAt: now,
    closeDate: new Date("2026-06-30T12:00:00.000Z"),
    contacts: [{ id: "contact-jordan", firstName: "Jordan", lastName: "Lee", email: "jordan.lee@acme.example" }],
    keywords: ["expansion", "procurement", "DPA"],
    ...overrides,
  };
}

function sourceItem(overrides: Partial<MatchingSourceItem> = {}): MatchingSourceItem {
  return {
    id: "src-scenario",
    accountId: null,
    opportunityId: null,
    contactId: null,
    visibility: SourceVisibility.TEAM,
    title: "Source note",
    body: "General update.",
    occurredAt: recent,
    ingestedAt: now,
    metadata: { authorization: { authorized: true, scope: "team" } },
    ...overrides,
  };
}

function acmeRenewal(overrides: Partial<MatchingOpportunity> = {}): MatchingOpportunity {
  return opportunity({
    id: "opp-acme-renewal",
    externalId: "OPP-ACME-RENEWAL",
    name: "Acme Renewal",
    keywords: ["renewal", "DPA", "legal"],
    contacts: [{ id: "contact-sam", firstName: "Sam", lastName: "Green", email: "sam.green@acme.example" }],
    ...overrides,
  });
}

function expectNotAutoAttached(match: SourceMatch) {
  expect(match.opportunityId).toBeNull();
  expect(["ambiguous", "unmatched"]).toContain(match.status);
}

describe("Deal-to-Source Matching Agent integration scenarios", () => {
  it("flags ambiguous Acme renewal vs expansion context", () => {
    const match = matchSourceToOpportunity(
      sourceItem({
        id: "src-acme-commercial",
        title: "Acme commercial next steps",
        body: "legal@acme.example and Alex Rivera discussed commercial next steps for Acme.",
        metadata: { ownerName: "Alex Rivera", authorization: { authorized: true, scope: "team" } },
      }),
      [opportunity(), acmeRenewal()],
    );

    expect(match.status).toBe("ambiguous");
    expect(match.opportunityId).toBeNull();
  });

  it('does not auto-attach "Acme legal stuck on DPA" when multiple Acme deals exist', () => {
    const match = matchSourceToOpportunity(sourceItem({ id: "src-acme-dpa", title: "Acme legal stuck on DPA", body: "Acme legal stuck on DPA." }), [opportunity(), acmeRenewal()]);

    expectNotAutoAttached(match);
  });

  it("matches a correctly linked manager note", () => {
    const match = matchSourceToOpportunity(
      sourceItem({
        id: "src-manager-note",
        title: "Manager note",
        body: "Manager note from QBR prep.",
        metadata: { linkedRecord: { type: "Opportunity", externalId: "OPP-ACME-EXPANSION" }, authorization: { authorized: true, scope: "team" } },
      }),
      [opportunity(), acmeRenewal()],
    );

    expect(match.status).toBe("matched");
    expect(match.opportunityId).toBe("opp-acme-expansion");
  });

  it("keeps an unmatched source available for review but not extraction", () => {
    const match = matchSourceToOpportunity(sourceItem({ id: "src-unmatched", title: "Vendor newsletter", body: "Generic market newsletter with no customer or deal context.", occurredAt: new Date("2025-01-01T12:00:00.000Z") }), [opportunity()], { referenceDate: now });

    expect(match).toMatchObject({ sourceItemId: "src-unmatched", opportunityId: null, status: "unmatched" });
    expect(match.reasons.join(" ")).toContain("Best candidate did not reach the minimum confidence threshold.");
  });

  it("handles duplicate account names by using contact and opportunity-specific signals", () => {
    const healthcareAcme = opportunity({ id: "opp-acme-healthcare", externalId: "OPP-ACME-HEALTHCARE", accountId: "acct-acme-healthcare", accountWebsite: "https://acme-health.example", name: "Acme Healthcare Pilot", contacts: [{ id: "contact-nora", firstName: "Nora", lastName: "Patel", email: "nora.patel@acme-health.example" }], keywords: ["pilot"] });
    const manufacturingAcme = opportunity({ id: "opp-acme-manufacturing", externalId: "OPP-ACME-MANUFACTURING", accountId: "acct-acme-manufacturing", accountWebsite: "https://acme-mfg.example", name: "Acme Manufacturing Expansion", contacts: [{ id: "contact-omar", firstName: "Omar", lastName: "Diaz", email: "omar.diaz@acme-mfg.example" }], keywords: ["factory"] });

    const match = matchSourceToOpportunity(sourceItem({ id: "src-duplicate-acme", title: "Acme pilot update", body: "Nora Patel at nora.patel@acme-health.example confirmed the pilot timeline for Acme.", metadata: { ownerName: "Alex Rivera", authorization: { authorized: true, scope: "team" } } }), [healthcareAcme, manufacturingAcme]);

    expect(match.status).toBe("matched");
    expect(match.opportunityId).toBe("opp-acme-healthcare");
  });

  it("matches subsidiary account names without attaching the parent-company opportunity", () => {
    const subsidiary = opportunity({ id: "opp-acme-security", externalId: "OPP-ACME-SECURITY", accountId: "acct-acme-security", accountName: "Acme Security", accountWebsite: "https://security.acme.example", name: "Acme Security Expansion", contacts: [{ id: "contact-ivy", firstName: "Ivy", lastName: "Chen", email: "ivy.chen@security.acme.example" }], keywords: ["security review"] });
    const parent = opportunity({ id: "opp-acme-parent", externalId: "OPP-ACME-PARENT", name: "Acme Parent Renewal" });

    const match = matchSourceToOpportunity(sourceItem({ id: "src-subsidiary", title: "Acme Security review", body: "Ivy Chen from ivy.chen@security.acme.example confirmed security review steps for Acme Security." }), [subsidiary, parent]);

    expect(match.status).toBe("matched");
    expect(match.opportunityId).toBe("opp-acme-security");
  });

  it("keeps similar company names separate", () => {
    const acme = opportunity({ id: "opp-acme", accountName: "Acme", name: "Acme Expansion" });
    const acmeon = opportunity({ id: "opp-acmeon", externalId: "OPP-ACMEON", accountId: "acct-acmeon", accountName: "Acmeon", accountWebsite: "https://acmeon.example", name: "Acmeon Expansion", contacts: [{ id: "contact-li", firstName: "Li", lastName: "Wong", email: "li.wong@acmeon.example" }], keywords: ["rollout"] });

    const match = matchSourceToOpportunity(sourceItem({ id: "src-similar-name", title: "Acmeon rollout", body: "Li Wong at li.wong@acmeon.example confirmed Acmeon rollout timing." }), [acme, acmeon]);

    expect(match.status).toBe("matched");
    expect(match.opportunityId).toBe("opp-acmeon");
  });

  it("flags renewal and expansion ambiguity when both are active at the same time", () => {
    const match = matchSourceToOpportunity(sourceItem({ id: "src-active-renewal-expansion", title: "Acme active deal update", body: "Acme asked Alex Rivera for commercial next steps from legal@acme.example.", metadata: { ownerName: "Alex Rivera", authorization: { authorized: true, scope: "team" } } }), [opportunity(), acmeRenewal()]);

    expect(match.status).toBe("ambiguous");
    expect(match.opportunityId).toBeNull();
  });

  it("does not auto-attach an email thread that mentions multiple accounts", () => {
    const beta = opportunity({ id: "opp-beta", externalId: "OPP-BETA", accountId: "acct-beta", accountName: "Beta Corp", accountWebsite: "https://beta.example", name: "Beta Corp Renewal", contacts: [{ id: "contact-bea", firstName: "Bea", lastName: "Ng", email: "bea.ng@beta.example" }], keywords: ["renewal"] });

    const match = matchSourceToOpportunity(sourceItem({ id: "src-multi-account-thread", title: "Acme and Beta thread", body: "Jordan Lee at jordan.lee@acme.example and Bea Ng at bea.ng@beta.example compared Acme Expansion procurement with Beta Corp Renewal timing." }), [opportunity(), beta]);

    expectNotAutoAttached(match);
  });

  it("does not auto-attach Slack-like short ambiguous content", () => {
    const match = matchSourceToOpportunity(sourceItem({ id: "src-slack-short", title: "slack", body: "Acme legal?" }), [opportunity(), acmeRenewal()]);

    expectNotAutoAttached(match);
  });

  it("does not match a contact who changed company when the new company context points elsewhere", () => {
    const beta = opportunity({ id: "opp-beta-expansion", externalId: "OPP-BETA-EXPANSION", accountId: "acct-beta", accountName: "Beta Corp", accountWebsite: "https://beta.example", name: "Beta Expansion", contacts: [{ id: "contact-jordan-beta", firstName: "Jordan", lastName: "Lee", email: "jordan.lee@beta.example" }], keywords: ["expansion"] });

    const match = matchSourceToOpportunity(sourceItem({ id: "src-contact-changed", title: "Beta Expansion", body: "Jordan Lee at jordan.lee@beta.example approved Beta Corp expansion." }), [opportunity(), beta]);

    expect(match.status).toBe("matched");
    expect(match.opportunityId).toBe("opp-beta-expansion");
    expect(match.opportunityId).not.toBe("opp-acme-expansion");
  });

  it("matches a misspelled account name when stronger contact, owner, timestamp, and keyword signals agree", () => {
    const match = matchSourceToOpportunity(
      sourceItem({
        id: "src-misspelled-account",
        title: "Ackme procurement",
        body: "Jordan Lee at jordan.lee@acme.example confirmed procurement timing for Ackme.",
        metadata: { ownerName: "Alex Rivera", authorization: { authorized: true, scope: "team" } },
      }),
      [opportunity()],
    );

    expect(match.status).toBe("matched");
    expect(match.opportunityId).toBe("opp-acme-expansion");
  });
});
