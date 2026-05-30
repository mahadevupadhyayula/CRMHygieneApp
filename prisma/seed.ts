import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import {
  AuditEventType,
  ForecastCategory,
  OpportunityStage,
  RecommendationStatus,
  SourceAuthorization,
  SourceItemType,
  SourceVisibility,
} from "@prisma/client";

export const STAGE_1_SEED_DATE = new Date("2026-05-30T12:00:00.000Z");

type ContactFixture = {
  id: string;
  accountId: string;
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  phone?: string;
  isDecisionMaker: boolean;
};

type OpportunityFixture = {
  id: string;
  accountId: string;
  ownerName: string;
  name: string;
  scenarioKey: string;
  amountCents: number;
  stage: OpportunityStage;
  forecastCategory: ForecastCategory;
  closeDate: Date;
  nextStep?: string;
  nextStepDueAt?: Date;
  lastActivityAt?: Date;
  contactIds: string[];
  snapshotFields: Record<string, string | null>;
  sources: Array<{
    id: string;
    type: SourceItemType;
    visibility: SourceVisibility;
    authorName: string;
    authorEmail: string;
    occurredAt: Date;
    title: string;
    body: string;
    externalId: string;
    authorization?: SourceAuthorization;
    isAuthorized?: boolean;
    linkedRecordType?: string;
    linkedRecordId?: string;
  }>;
  recommendation?: {
    id: string;
    fieldName: string;
    currentValue?: string | null;
    recommendedValue?: string | null;
    rationale: string;
    confidence: number;
  };
  comparison?: {
    fieldName: string;
    crmValue?: string | null;
    evidenceValue?: string | null;
    isMismatch: boolean;
    severity: string;
    rationale: string;
  };
  score: number;
};

type StageOneSeedFixture = {
  accounts: Prisma.AccountCreateManyInput[];
  contacts: ContactFixture[];
  opportunities: OpportunityFixture[];
};

const daysFromSeedDate = (days: number) => {
  const date = new Date(STAGE_1_SEED_DATE);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
};

const source = (
  opportunityId: string,
  scenarioKey: string,
  index: number,
  overrides: Partial<OpportunityFixture["sources"][number]>,
): OpportunityFixture["sources"][number] => ({
  id: `src_${scenarioKey}_${index}`,
  type: SourceItemType.NOTE,
  visibility: SourceVisibility.INTERNAL,
  authorName: "Maya Patel",
  authorEmail: "maya.patel@example.com",
  occurredAt: daysFromSeedDate(-2),
  title: `${scenarioKey} note ${index}`,
  body: "Seed note with opportunity context.",
  externalId: `seed-${scenarioKey}-${index}`,
  linkedRecordType: "Opportunity",
  linkedRecordId: opportunityId,
  isAuthorized: true,
  ...overrides,
});

export const buildStageOneSeedFixture = (): StageOneSeedFixture => {
  const accounts: Prisma.AccountCreateManyInput[] = [
    { id: "acct_acme", name: "Acme Manufacturing", industry: "Manufacturing", segment: "Enterprise", region: "North America", website: "https://acme.example" },
    { id: "acct_nimbus", name: "Nimbus Health", industry: "Healthcare", segment: "Mid-Market", region: "North America", website: "https://nimbus.example" },
    { id: "acct_pioneer", name: "Pioneer Finance", industry: "Financial Services", segment: "Enterprise", region: "EMEA", website: "https://pioneer.example" },
    { id: "acct_summit", name: "Summit Retail", industry: "Retail", segment: "Commercial", region: "North America", website: "https://summit.example" },
  ];

  const contacts: ContactFixture[] = [
    { id: "ct_acme_cio", accountId: "acct_acme", firstName: "Jordan", lastName: "Lee", title: "CIO", email: "jordan.lee@acme.example", isDecisionMaker: true },
    { id: "ct_acme_ops", accountId: "acct_acme", firstName: "Priya", lastName: "Shah", title: "VP Operations", email: "priya.shah@acme.example", isDecisionMaker: false },
    { id: "ct_nimbus_cfo", accountId: "acct_nimbus", firstName: "Morgan", lastName: "Diaz", title: "CFO", email: "morgan.diaz@nimbus.example", isDecisionMaker: true },
    { id: "ct_nimbus_it", accountId: "acct_nimbus", firstName: "Avery", lastName: "Chen", title: "Director of IT", email: "avery.chen@nimbus.example", isDecisionMaker: false },
    { id: "ct_pioneer_cro", accountId: "acct_pioneer", firstName: "Sam", lastName: "Okafor", title: "Chief Revenue Officer", email: "sam.okafor@pioneer.example", isDecisionMaker: true },
    { id: "ct_pioneer_legal", accountId: "acct_pioneer", firstName: "Riley", lastName: "Ng", title: "Legal Counsel", email: "riley.ng@pioneer.example", isDecisionMaker: false },
    { id: "ct_summit_vp", accountId: "acct_summit", firstName: "Taylor", lastName: "Brooks", title: "VP Digital", email: "taylor.brooks@summit.example", isDecisionMaker: true },
    { id: "ct_summit_sec", accountId: "acct_summit", firstName: "Casey", lastName: "Stone", title: "Security Lead", email: "casey.stone@summit.example", isDecisionMaker: false },
  ];

  const opportunities: OpportunityFixture[] = [
    {
      id: "opp_healthy_deal",
      accountId: "acct_acme",
      ownerName: "Maya Patel",
      name: "Acme Expansion — Healthy Deal",
      scenarioKey: "healthy-deal",
      amountCents: 18500000,
      stage: OpportunityStage.NEGOTIATION,
      forecastCategory: ForecastCategory.BEST_CASE,
      closeDate: daysFromSeedDate(45),
      nextStep: "Finalize mutual action plan with CIO",
      nextStepDueAt: daysFromSeedDate(4),
      lastActivityAt: daysFromSeedDate(-1),
      contactIds: ["ct_acme_cio", "ct_acme_ops"],
      snapshotFields: { stage: "NEGOTIATION", forecastCategory: "BEST_CASE", closeDate: "2026-07-14", nextStep: "Finalize mutual action plan with CIO" },
      sources: [source("opp_healthy_deal", "healthy_deal", 1, { type: SourceItemType.MEETING, title: "Mutual action plan review", body: "Jordan confirmed budget and timeline. Priya owns rollout planning." })],
      score: 94,
    },
    {
      id: "opp_missing_dm",
      accountId: "acct_nimbus",
      ownerName: "Luis Romero",
      name: "Nimbus Analytics — Missing Decision Maker",
      scenarioKey: "missing-decision-maker",
      amountCents: 9200000,
      stage: OpportunityStage.DISCOVERY,
      forecastCategory: ForecastCategory.PIPELINE,
      closeDate: daysFromSeedDate(60),
      nextStep: "Identify executive sponsor",
      nextStepDueAt: daysFromSeedDate(7),
      lastActivityAt: daysFromSeedDate(-3),
      contactIds: ["ct_nimbus_it"],
      snapshotFields: { stage: "DISCOVERY", forecastCategory: "PIPELINE", decisionMaker: null, nextStep: "Identify executive sponsor" },
      sources: [source("opp_missing_dm", "missing_dm", 1, { title: "Discovery notes", body: "Avery is evaluating but said CFO Morgan must approve any purchase." })],
      recommendation: { id: "rec_missing_dm", fieldName: "decisionMaker", currentValue: null, recommendedValue: "Morgan Diaz", rationale: "Discovery notes identify CFO approval as required.", confidence: 0.86 },
      comparison: { fieldName: "decisionMaker", crmValue: null, evidenceValue: "Morgan Diaz", isMismatch: true, severity: "high", rationale: "Decision maker is missing from the opportunity contact roles." },
      score: 62,
    },
    {
      id: "opp_stale_next_step",
      accountId: "acct_pioneer",
      ownerName: "Noah Smith",
      name: "Pioneer Risk Platform — Stale Next Step",
      scenarioKey: "stale-next-step",
      amountCents: 21000000,
      stage: OpportunityStage.PROPOSAL,
      forecastCategory: ForecastCategory.BEST_CASE,
      closeDate: daysFromSeedDate(30),
      nextStep: "Send pricing by May 10",
      nextStepDueAt: daysFromSeedDate(-20),
      lastActivityAt: daysFromSeedDate(-18),
      contactIds: ["ct_pioneer_cro"],
      snapshotFields: { stage: "PROPOSAL", nextStep: "Send pricing by May 10", nextStepDueAt: "2026-05-10" },
      sources: [source("opp_stale_next_step", "stale_next_step", 1, { occurredAt: daysFromSeedDate(-18), title: "Pricing follow-up", body: "Pricing was due three weeks ago; no updated customer next step captured." })],
      recommendation: { id: "rec_stale_next_step", fieldName: "nextStep", currentValue: "Send pricing by May 10", recommendedValue: "Confirm current pricing review owner and date", rationale: "Next step due date has passed with no newer activity.", confidence: 0.91 },
      comparison: { fieldName: "nextStepDueAt", crmValue: "2026-05-10", evidenceValue: "overdue", isMismatch: true, severity: "medium", rationale: "Next step is stale relative to the latest activity." },
      score: 58,
    },
    {
      id: "opp_procurement_blocker",
      accountId: "acct_acme",
      ownerName: "Maya Patel",
      name: "Acme Plant Modernization — Procurement Blocker",
      scenarioKey: "commit-procurement-blocker",
      amountCents: 32000000,
      stage: OpportunityStage.PROCUREMENT,
      forecastCategory: ForecastCategory.COMMIT,
      closeDate: daysFromSeedDate(14),
      nextStep: "Procurement to approve vendor onboarding",
      nextStepDueAt: daysFromSeedDate(2),
      lastActivityAt: daysFromSeedDate(-1),
      contactIds: ["ct_acme_cio", "ct_acme_ops"],
      snapshotFields: { stage: "PROCUREMENT", forecastCategory: "COMMIT", blocker: "vendor onboarding" },
      sources: [source("opp_procurement_blocker", "procurement_blocker", 1, { type: SourceItemType.EMAIL, title: "Procurement blocker", body: "Procurement has not approved vendor onboarding; buyer says close date may slip." })],
      recommendation: { id: "rec_procurement_blocker", fieldName: "forecastCategory", currentValue: "COMMIT", recommendedValue: "BEST_CASE", rationale: "Commit is risky while procurement onboarding remains unresolved.", confidence: 0.78 },
      comparison: { fieldName: "forecastCategory", crmValue: "COMMIT", evidenceValue: "BEST_CASE", isMismatch: true, severity: "high", rationale: "Open procurement blocker conflicts with commit forecast." },
      score: 66,
    },
    {
      id: "opp_unrealistic_close",
      accountId: "acct_nimbus",
      ownerName: "Luis Romero",
      name: "Nimbus Patient Portal — Unrealistic Close Date",
      scenarioKey: "close-date-unrealistic",
      amountCents: 14500000,
      stage: OpportunityStage.DISCOVERY,
      forecastCategory: ForecastCategory.BEST_CASE,
      closeDate: daysFromSeedDate(5),
      nextStep: "Schedule technical validation",
      nextStepDueAt: daysFromSeedDate(3),
      lastActivityAt: daysFromSeedDate(-2),
      contactIds: ["ct_nimbus_cfo", "ct_nimbus_it"],
      snapshotFields: { stage: "DISCOVERY", closeDate: "2026-06-04", nextStep: "Schedule technical validation" },
      sources: [source("opp_unrealistic_close", "unrealistic_close", 1, { title: "Discovery gap", body: "Customer still needs technical validation and compliance review before purchase." })],
      recommendation: { id: "rec_unrealistic_close", fieldName: "closeDate", currentValue: "2026-06-04", recommendedValue: "2026-07-29", rationale: "Discovery and compliance steps make a five-day close date unrealistic.", confidence: 0.84 },
      comparison: { fieldName: "closeDate", crmValue: "2026-06-04", evidenceValue: "2026-07-29", isMismatch: true, severity: "high", rationale: "Evidence indicates required steps exceed current close window." },
      score: 55,
    },
    {
      id: "opp_stage_mismatch",
      accountId: "acct_summit",
      ownerName: "Iris Wang",
      name: "Summit Checkout — Stage Mismatch",
      scenarioKey: "stage-mismatch",
      amountCents: 11000000,
      stage: OpportunityStage.PROPOSAL,
      forecastCategory: ForecastCategory.PIPELINE,
      closeDate: daysFromSeedDate(40),
      nextStep: "Send proposal",
      nextStepDueAt: daysFromSeedDate(5),
      lastActivityAt: daysFromSeedDate(-1),
      contactIds: ["ct_summit_vp"],
      snapshotFields: { stage: "PROPOSAL", customerState: "still qualifying budget" },
      sources: [source("opp_stage_mismatch", "stage_mismatch", 1, { type: SourceItemType.CALL, title: "Qualification call", body: "Taylor said budget is not approved and requirements are still being gathered." })],
      recommendation: { id: "rec_stage_mismatch", fieldName: "stage", currentValue: "PROPOSAL", recommendedValue: "QUALIFICATION", rationale: "Latest call indicates qualification is incomplete.", confidence: 0.8 },
      comparison: { fieldName: "stage", crmValue: "PROPOSAL", evidenceValue: "QUALIFICATION", isMismatch: true, severity: "medium", rationale: "CRM stage is ahead of buyer evidence." },
      score: 61,
    },
    {
      id: "opp_forecast_mismatch",
      accountId: "acct_pioneer",
      ownerName: "Noah Smith",
      name: "Pioneer Data Cloud — Forecast Mismatch",
      scenarioKey: "forecast-mismatch",
      amountCents: 27500000,
      stage: OpportunityStage.NEGOTIATION,
      forecastCategory: ForecastCategory.PIPELINE,
      closeDate: daysFromSeedDate(20),
      nextStep: "Confirm signature date",
      nextStepDueAt: daysFromSeedDate(2),
      lastActivityAt: daysFromSeedDate(-1),
      contactIds: ["ct_pioneer_cro", "ct_pioneer_legal"],
      snapshotFields: { stage: "NEGOTIATION", forecastCategory: "PIPELINE", buyerIntent: "verbal commit" },
      sources: [source("opp_forecast_mismatch", "forecast_mismatch", 1, { type: SourceItemType.EMAIL, title: "Verbal commit", body: "Sam confirmed budget is approved and asked for final signature packet this week." })],
      recommendation: { id: "rec_forecast_mismatch", fieldName: "forecastCategory", currentValue: "PIPELINE", recommendedValue: "BEST_CASE", rationale: "Evidence is stronger than pipeline but final signature is not complete.", confidence: 0.76 },
      comparison: { fieldName: "forecastCategory", crmValue: "PIPELINE", evidenceValue: "BEST_CASE", isMismatch: true, severity: "medium", rationale: "Buyer evidence suggests forecast can be upgraded." },
      score: 73,
    },
    {
      id: "opp_legal_pending",
      accountId: "acct_pioneer",
      ownerName: "Noah Smith",
      name: "Pioneer Compliance Suite — Legal Pending",
      scenarioKey: "legal-pending",
      amountCents: 19800000,
      stage: OpportunityStage.NEGOTIATION,
      forecastCategory: ForecastCategory.COMMIT,
      closeDate: daysFromSeedDate(12),
      nextStep: "Legal to return redlines",
      nextStepDueAt: daysFromSeedDate(1),
      lastActivityAt: daysFromSeedDate(-2),
      contactIds: ["ct_pioneer_cro", "ct_pioneer_legal"],
      snapshotFields: { stage: "NEGOTIATION", legalStatus: "pending redlines", forecastCategory: "COMMIT" },
      sources: [source("opp_legal_pending", "legal_pending", 1, { type: SourceItemType.DOCUMENT, title: "MSA redlines", body: "Riley has open liability and data processing redlines pending legal review." })],
      recommendation: { id: "rec_legal_pending", fieldName: "nextStep", currentValue: "Legal to return redlines", recommendedValue: "Resolve MSA liability and DPA redlines", rationale: "Legal blockers should be explicit in next step.", confidence: 0.83 },
      comparison: { fieldName: "legalStatus", crmValue: null, evidenceValue: "pending redlines", isMismatch: true, severity: "high", rationale: "Legal status is not represented in CRM fields." },
      score: 68,
    },
    {
      id: "opp_security_review",
      accountId: "acct_summit",
      ownerName: "Iris Wang",
      name: "Summit Loyalty — Security Review Pending",
      scenarioKey: "security-review-pending",
      amountCents: 8800000,
      stage: OpportunityStage.PROCUREMENT,
      forecastCategory: ForecastCategory.BEST_CASE,
      closeDate: daysFromSeedDate(25),
      nextStep: "Complete security questionnaire",
      nextStepDueAt: daysFromSeedDate(6),
      lastActivityAt: daysFromSeedDate(-4),
      contactIds: ["ct_summit_vp", "ct_summit_sec"],
      snapshotFields: { stage: "PROCUREMENT", securityReview: "pending", closeDate: "2026-06-24" },
      sources: [source("opp_security_review", "security_review", 1, { type: SourceItemType.SUPPORT_TICKET, visibility: SourceVisibility.PRIVATE, authorization: SourceAuthorization.UNAUTHORIZED, isAuthorized: false, authorName: "Casey Stone", authorEmail: "casey.stone@summit.example", title: "Private security review", body: "Security questionnaire is private and not authorized for recommendation text." })],
      recommendation: { id: "rec_security_review", fieldName: "nextStep", currentValue: "Complete security questionnaire", recommendedValue: "Confirm authorized security review evidence before updating", rationale: "The only detailed blocker source is private, so recommendation should avoid quoting it.", confidence: 0.64 },
      comparison: { fieldName: "securityReview", crmValue: null, evidenceValue: "pending", isMismatch: true, severity: "medium", rationale: "Security review state is missing from CRM structured fields." },
      score: 70,
    },
    {
      id: "opp_no_activity_21",
      accountId: "acct_acme",
      ownerName: "Maya Patel",
      name: "Acme Service Desk — No Activity 21 Days",
      scenarioKey: "no-activity-21-days",
      amountCents: 7600000,
      stage: OpportunityStage.PROPOSAL,
      forecastCategory: ForecastCategory.PIPELINE,
      closeDate: daysFromSeedDate(35),
      nextStep: "Wait for buyer feedback",
      nextStepDueAt: daysFromSeedDate(-5),
      lastActivityAt: daysFromSeedDate(-21),
      contactIds: [],
      snapshotFields: { stage: "PROPOSAL", lastActivityAt: "2026-05-09", nextStep: "Wait for buyer feedback" },
      sources: [source("opp_no_activity_21", "no_activity_21", 1, { occurredAt: daysFromSeedDate(-21), title: "Old proposal sent", body: "Proposal was sent; no contacts are associated to the CRM opportunity." })],
      recommendation: { id: "rec_no_activity_21", fieldName: "nextStep", currentValue: "Wait for buyer feedback", recommendedValue: "Schedule re-engagement with an identified buyer", rationale: "Opportunity has no contacts and no activity in 21 days.", confidence: 0.89 },
      comparison: { fieldName: "lastActivityAt", crmValue: "2026-05-09", evidenceValue: "stale", isMismatch: true, severity: "high", rationale: "No activity for 21 days and no contacts on the deal." },
      score: 42,
    },
    {
      id: "opp_conflicting_notes",
      accountId: "acct_nimbus",
      ownerName: "Luis Romero",
      name: "Nimbus Claims AI — Conflicting Notes",
      scenarioKey: "multiple-conflicting-notes",
      amountCents: 13400000,
      stage: OpportunityStage.NEGOTIATION,
      forecastCategory: ForecastCategory.BEST_CASE,
      closeDate: daysFromSeedDate(18),
      nextStep: "Confirm final commercial terms",
      nextStepDueAt: daysFromSeedDate(3),
      lastActivityAt: daysFromSeedDate(-1),
      contactIds: ["ct_nimbus_cfo", "ct_nimbus_it"],
      snapshotFields: { stage: "NEGOTIATION", amount: "134000", closeDate: "2026-06-17" },
      sources: [
        source("opp_conflicting_notes", "conflicting_notes", 1, { title: "Duplicate buyer update", body: "Buyer approved $134k and wants signature on June 17.", externalId: "seed-conflicting-notes-a" }),
        source("opp_conflicting_notes", "conflicting_notes", 2, { title: "Duplicate buyer update", body: "Buyer approved $134k and wants signature on June 17.", externalId: "seed-conflicting-notes-b" }),
        source("opp_conflicting_notes", "conflicting_notes", 3, { authorName: "Luis Romero", authorEmail: "luis.romero@example.com", title: "Conflicting close update", body: "Buyer may delay to next quarter unless discount is increased.", externalId: "seed-conflicting-notes-c" }),
      ],
      recommendation: { id: "rec_conflicting_notes", fieldName: "closeDate", currentValue: "2026-06-17", recommendedValue: "Needs review", rationale: "Duplicate and conflicting notes require human validation before CRM update.", confidence: 0.52 },
      comparison: { fieldName: "closeDate", crmValue: "2026-06-17", evidenceValue: "conflicting", isMismatch: true, severity: "medium", rationale: "Latest evidence conflicts on close timing." },
      score: 59,
    },
    {
      id: "opp_ambiguous_source",
      accountId: "acct_summit",
      ownerName: "Iris Wang",
      name: "Summit Mobile App — Ambiguous Source Matching",
      scenarioKey: "ambiguous-source-matching",
      amountCents: 9900000,
      stage: OpportunityStage.QUALIFICATION,
      forecastCategory: ForecastCategory.PIPELINE,
      closeDate: daysFromSeedDate(75),
      nextStep: undefined,
      nextStepDueAt: undefined,
      lastActivityAt: daysFromSeedDate(-90),
      contactIds: ["ct_summit_vp"],
      snapshotFields: { stage: "QUALIFICATION", nextStep: null, lastActivityAt: "2026-03-01" },
      sources: [source("opp_ambiguous_source", "ambiguous_source", 1, { occurredAt: daysFromSeedDate(-90), type: SourceItemType.CRM_UPDATE, title: "Old CRM import only", body: "Imported opportunity record with no notes attached.", linkedRecordType: "Account", linkedRecordId: "acct_summit" })],
      recommendation: { id: "rec_ambiguous_source", fieldName: "sourceMatch", currentValue: "Account", recommendedValue: "Needs manual matching", rationale: "Only old account-level CRM source exists and no opportunity notes are available.", confidence: 0.47 },
      comparison: { fieldName: "sourceMatch", crmValue: "Opportunity", evidenceValue: "Account", isMismatch: true, severity: "low", rationale: "Source metadata is account-linked and ambiguous for this opportunity." },
      score: 49,
    },
  ];

  return { accounts, contacts, opportunities };
};

export const seedDatabase = async (prisma: PrismaClient = new PrismaClient()) => {
  const fixture = buildStageOneSeedFixture();

  await prisma.feedbackEvent.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.approvalAction.deleteMany();
  await prisma.recommendation.deleteMany();
  await prisma.hygieneScore.deleteMany();
  await prisma.fieldComparison.deleteMany();
  await prisma.extractedFact.deleteMany();
  await prisma.sourceItem.deleteMany();
  await prisma.cRMFieldSnapshot.deleteMany();
  await prisma.opportunity.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.account.deleteMany();

  await prisma.account.createMany({ data: fixture.accounts });
  await prisma.contact.createMany({ data: fixture.contacts });

  for (const opportunity of fixture.opportunities) {
    await prisma.opportunity.create({
      data: {
        id: opportunity.id,
        accountId: opportunity.accountId,
        ownerName: opportunity.ownerName,
        name: opportunity.name,
        scenarioKey: opportunity.scenarioKey,
        amountCents: opportunity.amountCents,
        stage: opportunity.stage,
        forecastCategory: opportunity.forecastCategory,
        closeDate: opportunity.closeDate,
        nextStep: opportunity.nextStep,
        nextStepDueAt: opportunity.nextStepDueAt,
        lastActivityAt: opportunity.lastActivityAt,
        contacts: { connect: opportunity.contactIds.map((id) => ({ id })) },
      },
    });

    await prisma.cRMFieldSnapshot.createMany({
      data: Object.entries(opportunity.snapshotFields).map(([fieldName, fieldValue], index) => ({
        id: `snap_${opportunity.id}_${index}`,
        opportunityId: opportunity.id,
        fieldName,
        fieldValue,
        capturedAt: STAGE_1_SEED_DATE,
      })),
    });

    for (const item of opportunity.sources) {
      await prisma.sourceItem.create({
        data: {
          id: item.id,
          accountId: opportunity.accountId,
          opportunityId: opportunity.id,
          type: item.type,
          visibility: item.visibility,
          authorName: item.authorName,
          authorEmail: item.authorEmail,
          occurredAt: item.occurredAt,
          title: item.title,
          body: item.body,
          sourceSystem: "stage-one-seed",
          externalId: item.externalId,
          linkedRecordType: item.linkedRecordType ?? "Opportunity",
          linkedRecordId: item.linkedRecordId ?? opportunity.id,
          authorization: item.authorization ?? (item.isAuthorized === false ? SourceAuthorization.UNAUTHORIZED : SourceAuthorization.AUTHORIZED),
          isAuthorized: item.isAuthorized ?? true,
        },
      });
    }

    const primarySource = opportunity.sources[0];

    await prisma.extractedFact.create({
      data: {
        id: `fact_${opportunity.id}`,
        opportunityId: opportunity.id,
        sourceItemId: primarySource.id,
        factType: opportunity.comparison?.fieldName ?? "deal_health",
        factValue: opportunity.comparison?.evidenceValue ?? "healthy",
        confidence: opportunity.recommendation?.confidence ?? 0.92,
        extractedAt: STAGE_1_SEED_DATE,
      },
    });

    if (opportunity.comparison) {
      await prisma.fieldComparison.create({
        data: {
          id: `cmp_${opportunity.id}`,
          opportunityId: opportunity.id,
          sourceItemId: primarySource.id,
          fieldName: opportunity.comparison.fieldName,
          crmValue: opportunity.comparison.crmValue,
          evidenceValue: opportunity.comparison.evidenceValue,
          isMismatch: opportunity.comparison.isMismatch,
          severity: opportunity.comparison.severity,
          rationale: opportunity.comparison.rationale,
          comparedAt: STAGE_1_SEED_DATE,
        },
      });
    }

    await prisma.hygieneScore.create({
      data: {
        id: `score_${opportunity.id}`,
        opportunityId: opportunity.id,
        score: opportunity.score,
        grade: opportunity.score >= 85 ? "A" : opportunity.score >= 70 ? "B" : opportunity.score >= 55 ? "C" : "D",
        reasonSummary: `Stage 1 fixture score for ${opportunity.scenarioKey}.`,
        calculatedAt: STAGE_1_SEED_DATE,
      },
    });

    if (opportunity.recommendation) {
      await prisma.recommendation.create({
        data: {
          id: opportunity.recommendation.id,
          opportunityId: opportunity.id,
          sourceItemId: primarySource.id,
          status: RecommendationStatus.OPEN,
          fieldName: opportunity.recommendation.fieldName,
          currentValue: opportunity.recommendation.currentValue,
          recommendedValue: opportunity.recommendation.recommendedValue,
          rationale: opportunity.recommendation.rationale,
          confidence: opportunity.recommendation.confidence,
        },
      });

      await prisma.approvalAction.create({
        data: {
          id: `approval_${opportunity.id}`,
          opportunityId: opportunity.id,
          recommendationId: opportunity.recommendation.id,
          requestedBy: "crm-hygiene-agent@example.com",
          notes: "Seed approval request for downstream workflow tests.",
        },
      });
    }

    await prisma.auditEvent.create({
      data: {
        id: `audit_${opportunity.id}`,
        accountId: opportunity.accountId,
        opportunityId: opportunity.id,
        sourceItemId: primarySource.id,
        eventType: AuditEventType.SEED_CREATED,
        actor: "stage-one-seed",
        message: `Seeded ${opportunity.scenarioKey} fixture opportunity.`,
        metadataJson: JSON.stringify({ scenarioKey: opportunity.scenarioKey }),
        createdAt: STAGE_1_SEED_DATE,
      },
    });
  }

  await prisma.feedbackEvent.create({
    data: {
      id: "feedback_stage_one_seed",
      accountId: "acct_acme",
      opportunityId: "opp_healthy_deal",
      actor: "sales-manager@example.com",
      rating: 5,
      comment: "Healthy seed deal should remain unchanged by hygiene rules.",
      createdAt: STAGE_1_SEED_DATE,
    },
  });

  return fixture;
};

const main = async () => {
  const prisma = new PrismaClient();
  await seedDatabase(prisma);
  await prisma.$disconnect();
};

if (process.env.PRISMA_SEED_RUNNER === "true") {
  void main();
}
