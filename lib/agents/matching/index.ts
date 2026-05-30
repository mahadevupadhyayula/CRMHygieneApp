import { SourceVisibility } from "@prisma/client";

import { matchingOpportunitySchema, matchingOptionsSchema, matchingSourceItemSchema, sourceMatchSchema } from "./schemas";
import type { MatchingOpportunity, MatchingOptions, MatchingSourceItem, SourceMatch } from "./types";

type ScoredOpportunity = {
  opportunity: MatchingOpportunity;
  score: number;
  reasons: string[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DIRECT_RELATIONSHIP_WEIGHT = 0.78;
const EXACT_OPPORTUNITY_NAME_WEIGHT = 0.72;
const ACCOUNT_NAME_WEIGHT = 0.42;
const CONTACT_DOMAIN_WEIGHT = 0.18;
const CONTACT_NAME_WEIGHT = 0.16;
const OWNER_TEAM_WEIGHT = 0.14;
const TIMESTAMP_PROXIMITY_WEIGHT = 0.1;
const KEYWORD_WEIGHT = 0.08;
const OLD_UNRELATED_NOTE_PENALTY = 0.25;

export function matchSourceToOpportunity(sourceItemInput: MatchingSourceItem, opportunitiesInput: MatchingOpportunity[], optionsInput: Partial<MatchingOptions> = {}): SourceMatch {
  const sourceItem = matchingSourceItemSchema.parse(sourceItemInput);
  const opportunities = opportunitiesInput.map((opportunity) => matchingOpportunitySchema.parse(opportunity));
  const options = matchingOptionsSchema.parse(optionsInput);

  if (isIneligibleSource(sourceItem)) {
    return sourceMatchSchema.parse({
      sourceItemId: sourceItem.id,
      opportunityId: null,
      confidence: 0,
      reasons: ["Source item is private or marked unauthorized and cannot be matched."],
      status: "unmatched",
    });
  }

  if (opportunities.length === 0) {
    return sourceMatchSchema.parse({
      sourceItemId: sourceItem.id,
      opportunityId: null,
      confidence: 0,
      reasons: ["No candidate opportunities were provided."],
      status: "unmatched",
    });
  }

  const scored = opportunities.map((opportunity) => scoreOpportunity(sourceItem, opportunity, options)).sort((left, right) => right.score - left.score || left.opportunity.id.localeCompare(right.opportunity.id));
  const best = scored[0];
  const runnerUp = scored[1];

  if (!best || best.score < options.minimumMatchConfidence) {
    return sourceMatchSchema.parse({
      sourceItemId: sourceItem.id,
      opportunityId: null,
      confidence: roundConfidence(best?.score ?? 0),
      reasons: best?.reasons.length ? [...best.reasons, "Best candidate did not reach the minimum confidence threshold."] : ["No matching signals reached the minimum confidence threshold."],
      status: "unmatched",
    });
  }

  if (runnerUp?.opportunity.isActive && best.opportunity.isActive && runnerUp.score >= options.minimumMatchConfidence && best.score - runnerUp.score <= options.ambiguityConfidenceDelta) {
    return sourceMatchSchema.parse({
      sourceItemId: sourceItem.id,
      opportunityId: null,
      confidence: roundConfidence(best.score),
      reasons: [
        ...best.reasons,
        `Ambiguous: candidate ${runnerUp.opportunity.id} is within ${options.ambiguityConfidenceDelta.toFixed(2)} confidence of ${best.opportunity.id}.`,
        "Preserved for review; do not use this source item for extraction until a human resolves the match.",
      ],
      status: "ambiguous",
    });
  }

  return sourceMatchSchema.parse({
    sourceItemId: sourceItem.id,
    opportunityId: best.opportunity.id,
    confidence: roundConfidence(best.score),
    reasons: best.reasons,
    status: "matched",
  });
}

export function matchSourcesToOpportunities(sourceItems: MatchingSourceItem[], opportunities: MatchingOpportunity[], options: Partial<MatchingOptions> = {}): SourceMatch[] {
  return sourceItems.map((sourceItem) => matchSourceToOpportunity(sourceItem, opportunities, options));
}

function scoreOpportunity(sourceItem: MatchingSourceItem, opportunity: MatchingOpportunity, options: MatchingOptions): ScoredOpportunity {
  let score = 0;
  const reasons: string[] = [];
  const sourceText = normalizedSearchText([sourceItem.title, sourceItem.body, sourceItem.metadata.matchedText]);

  if (hasDirectRelationship(sourceItem, opportunity)) {
    score += DIRECT_RELATIONSHIP_WEIGHT;
    reasons.push("Direct CRM relationship links the source item to this opportunity.");
  }

  if (containsPhrase(sourceText, opportunity.name)) {
    score += EXACT_OPPORTUNITY_NAME_WEIGHT;
    reasons.push("Exact opportunity name appears in the source item.");
  }

  if (opportunity.accountName && containsPhrase(sourceText, opportunity.accountName)) {
    score += ACCOUNT_NAME_WEIGHT;
    reasons.push("Account name appears in the source item.");
  }

  if (hasContactEmailDomainSignal(sourceItem, opportunity, sourceText)) {
    score += CONTACT_DOMAIN_WEIGHT;
    reasons.push("Contact email domain aligns with the opportunity account or contacts.");
  }

  if (hasContactNameMention(sourceText, opportunity)) {
    score += CONTACT_NAME_WEIGHT;
    reasons.push("A contact name associated with the opportunity appears in the source item.");
  }

  if (hasOwnerOrTeamMatch(sourceItem, opportunity)) {
    score += OWNER_TEAM_WEIGHT;
    reasons.push("Owner or team metadata aligns with the opportunity owner/team.");
  }

  const proximityReason = timestampProximityReason(sourceItem, opportunity);
  if (proximityReason) {
    score += TIMESTAMP_PROXIMITY_WEIGHT;
    reasons.push(proximityReason);
  }

  const keywordMatches = matchingKeywords(sourceText, sourceItem, opportunity);
  if (keywordMatches.length > 0) {
    score += Math.min(0.16, KEYWORD_WEIGHT * keywordMatches.length);
    reasons.push(`Keyword references matched: ${keywordMatches.join(", ")}.`);
  }

  if (isOldUnrelatedSource(sourceItem, opportunity, options, sourceText)) {
    score -= OLD_UNRELATED_NOTE_PENALTY;
    reasons.push("Old source item lacks direct opportunity or account references, lowering confidence.");
  }

  const accountOnlyActiveCompetitors = opportunity.accountName && containsPhrase(sourceText, opportunity.accountName) && !hasDirectRelationship(sourceItem, opportunity) && !containsPhrase(sourceText, opportunity.name);
  if (accountOnlyActiveCompetitors) {
    const accountSpecificSignal = hasContactNameMention(sourceText, opportunity) || hasContactEmailDomainSignal(sourceItem, opportunity, sourceText) || hasOwnerOrTeamMatch(sourceItem, opportunity);
    if (!accountSpecificSignal) {
      score = Math.min(score, 0.58);
      reasons.push("Account-only mention is capped at medium confidence without opportunity-specific signals.");
    }
  }

  return {
    opportunity,
    score: clamp(score, 0, 1),
    reasons: reasons.length > 0 ? reasons : ["No strong matching signals were found for this opportunity."],
  };
}

function hasDirectRelationship(sourceItem: MatchingSourceItem, opportunity: MatchingOpportunity): boolean {
  const linkedRecord = sourceItem.metadata.linkedRecord;
  const linkedType = linkedRecord?.type?.toLowerCase();

  return (
    sourceItem.opportunityId === opportunity.id ||
    (Boolean(opportunity.externalId) && sourceItem.opportunityId === opportunity.externalId) ||
    linkedRecord?.id === opportunity.id ||
    (Boolean(opportunity.externalId) && linkedRecord?.externalId === opportunity.externalId && (!linkedType || linkedType.includes("opportunity")))
  );
}

function hasContactEmailDomainSignal(sourceItem: MatchingSourceItem, opportunity: MatchingOpportunity, sourceText: string): boolean {
  const sourceDomains = new Set(extractDomains([sourceItem.metadata.authorEmail, ...(sourceItem.metadata.participants ?? [])].join(" ") + " " + sourceText));
  if (sourceDomains.size === 0) {
    return false;
  }

  const opportunityDomains = new Set<string>();
  for (const contact of opportunity.contacts) {
    const domain = emailDomain(contact.email ?? undefined);
    if (domain) {
      opportunityDomains.add(domain);
    }
  }

  const websiteDomain = websiteHost(opportunity.accountWebsite ?? undefined);
  if (websiteDomain) {
    opportunityDomains.add(websiteDomain);
  }

  return [...sourceDomains].some((domain) => opportunityDomains.has(domain));
}

function hasContactNameMention(sourceText: string, opportunity: MatchingOpportunity): boolean {
  return opportunity.contacts.some((contact) => {
    const fullName = contact.fullName ?? [contact.firstName, contact.lastName].filter(Boolean).join(" ");
    return Boolean(fullName && fullName.includes(" ") && containsPhrase(sourceText, fullName));
  });
}

function hasOwnerOrTeamMatch(sourceItem: MatchingSourceItem, opportunity: MatchingOpportunity): boolean {
  const sourceOwner = normalizeText(sourceItem.metadata.ownerName ?? sourceItem.metadata.author ?? "");
  const sourceTeam = normalizeText(sourceItem.metadata.teamName ?? "");
  const owner = normalizeText(opportunity.ownerName ?? "");
  const teams = opportunity.teamNames.map(normalizeText);

  return Boolean((sourceOwner && owner && sourceOwner === owner) || (sourceTeam && teams.includes(sourceTeam)));
}

function timestampProximityReason(sourceItem: MatchingSourceItem, opportunity: MatchingOpportunity): string | null {
  const sourceTime = sourceItem.occurredAt?.getTime() ?? sourceItem.ingestedAt?.getTime();
  if (!sourceTime) {
    return null;
  }

  const opportunityDates = [opportunity.updatedAt, opportunity.createdAt, opportunity.closeDate].filter((date): date is Date => date instanceof Date);
  const isClose = opportunityDates.some((date) => Math.abs(sourceTime - date.getTime()) <= 30 * DAY_MS);
  return isClose ? "Source timestamp is near opportunity activity or close-date context." : null;
}

function matchingKeywords(sourceText: string, sourceItem: MatchingSourceItem, opportunity: MatchingOpportunity): string[] {
  const keywords = [...opportunity.keywords, ...(sourceItem.metadata.keywords ?? [])]
    .map(normalizeText)
    .filter((keyword) => keyword.length >= 3);
  return [...new Set(keywords.filter((keyword) => containsPhrase(sourceText, keyword)))].slice(0, 3);
}

function isOldUnrelatedSource(sourceItem: MatchingSourceItem, opportunity: MatchingOpportunity, options: MatchingOptions, sourceText: string): boolean {
  const referenceDate = options.referenceDate ?? opportunity.updatedAt ?? new Date();
  const sourceDate = sourceItem.occurredAt ?? sourceItem.ingestedAt;
  if (!sourceDate) {
    return false;
  }

  const ageDays = (referenceDate.getTime() - sourceDate.getTime()) / DAY_MS;
  return ageDays > options.oldSourceAgeDays && !hasDirectRelationship(sourceItem, opportunity) && !containsPhrase(sourceText, opportunity.name) && !(opportunity.accountName && containsPhrase(sourceText, opportunity.accountName));
}

function isIneligibleSource(sourceItem: MatchingSourceItem): boolean {
  return sourceItem.visibility === SourceVisibility.PRIVATE || sourceItem.metadata.authorized === false || sourceItem.metadata.authorization?.authorized === false;
}

function normalizedSearchText(values: Array<string | null | undefined>): string {
  return normalizeText(values.filter(Boolean).join(" "));
}

function normalizeText(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9@.]+/g, " ").replace(/\s+/g, " ").trim();
}

function containsPhrase(text: string, phrase: string): boolean {
  const normalizedPhrase = normalizeText(phrase);
  return normalizedPhrase.length > 0 && ` ${text} `.includes(` ${normalizedPhrase} `);
}

function extractDomains(text: string): string[] {
  const matches = text.match(/[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})/gi) ?? [];
  return matches.map((match) => emailDomain(match)).filter((domain): domain is string => Boolean(domain));
}

function emailDomain(email: string | undefined): string | null {
  const domain = email?.split("@")[1]?.toLowerCase();
  return domain || null;
}

function websiteHost(url: string | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]?.toLowerCase() || null;
  }
}

function roundConfidence(value: number): number {
  return Math.round(clamp(value, 0, 1) * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export { matchingContactSchema, matchingOpportunitySchema, matchingOptionsSchema, matchingSourceItemSchema, matchingSourceMetadataSchema, sourceMatchSchema, sourceMatchStatusSchema } from "./schemas";
export type { MatchingContact, MatchingOpportunity, MatchingOptions, MatchingSourceItem, MatchingSourceMetadata, SourceMatch, SourceMatchStatus } from "./types";
