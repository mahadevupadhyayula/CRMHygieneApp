import { PrismaClient, SourceType, SourceVisibility } from "@prisma/client";

const prisma = new PrismaClient();

const BASE_NOW = new Date("2026-05-30T12:00:00.000Z");

function daysFromBase(days: number): Date {
  const date = new Date(BASE_NOW);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function timestamp(days: number, hour = 15, minute = 0): Date {
  const date = daysFromBase(days);
  date.setUTCHours(hour, minute, 0, 0);
  return date;
}

function metadata(params: {
  author: string;
  externalId: string;
  sourceSystem: string;
  linkedRecordType: string;
  linkedRecordExternalId: string;
  authorized: boolean;
  authorizationScope: string;
  duplicateOf?: string;
  matchedText?: string;
}) {
  return JSON.stringify({
    author: params.author,
    externalId: params.externalId,
    sourceSystem: params.sourceSystem,
    linkedRecord: {
      type: params.linkedRecordType,
      externalId: params.linkedRecordExternalId,
    },
    authorization: {
      authorized: params.authorized,
      scope: params.authorizationScope,
    },
    duplicateOf: params.duplicateOf,
    matchedText: params.matchedText,
  });
}

type ContactFixture = {
  externalId: string;
  firstName: string;
  lastName: string;
  email: string;
  title: string;
  role: string;
  isPrimary?: boolean;
};

type SourceFixture = {
  externalId: string;
  type: SourceType;
  visibility: SourceVisibility;
  title: string;
  author: string;
  body: string;
  occurredAt: Date;
  contactExternalId?: string;
  uri?: string;
  authorized?: boolean;
  authorizationScope?: string;
  duplicateOf?: string;
  matchedText?: string;
};

type SnapshotFixture = {
  fieldName: string;
  fieldLabel: string;
  dataType: string;
  value: string;
};

type OpportunityFixture = {
  externalId: string;
  account: {
    externalId: string;
    name: string;
    website: string;
    industry: string;
    segment: string;
    ownerName: string;
  };
  name: string;
  stage:
    | "PROSPECTING"
    | "QUALIFICATION"
    | "DISCOVERY"
    | "PROPOSAL"
    | "NEGOTIATION"
    | "CLOSED_WON"
    | "CLOSED_LOST";
  forecastCategory: "PIPELINE" | "BEST_CASE" | "COMMIT" | "CLOSED" | "OMITTED";
  amount: number;
  closeDate: Date;
  ownerName: string;
  description: string;
  contacts: ContactFixture[];
  snapshots: SnapshotFixture[];
  sources: SourceFixture[];
};

const defaultSnapshots = (stage: string, forecastCategory: string, amount: number, closeDate: Date): SnapshotFixture[] => [
  { fieldName: "StageName", fieldLabel: "Stage", dataType: "picklist", value: stage },
  { fieldName: "ForecastCategoryName", fieldLabel: "Forecast Category", dataType: "picklist", value: forecastCategory },
  { fieldName: "Amount", fieldLabel: "Amount", dataType: "currency", value: String(amount) },
  { fieldName: "CloseDate", fieldLabel: "Close Date", dataType: "date", value: closeDate.toISOString().slice(0, 10) },
];

const fixtures: OpportunityFixture[] = [
  {
    externalId: "OPP-001-HEALTHY",
    account: { externalId: "ACC-001", name: "Northstar Analytics", website: "https://northstar.example", industry: "Software", segment: "Enterprise", ownerName: "Alex Rivera" },
    name: "Northstar Analytics - Expansion",
    stage: "NEGOTIATION",
    forecastCategory: "COMMIT",
    amount: 185000,
    closeDate: daysFromBase(18),
    ownerName: "Alex Rivera",
    description: "Healthy deal with confirmed champion, executive sponsor, mutual plan, and current next step.",
    contacts: [
      { externalId: "CON-001-A", firstName: "Priya", lastName: "Shah", email: "priya.shah@northstar.example", title: "VP Revenue Operations", role: "Economic Buyer", isPrimary: true },
      { externalId: "CON-001-B", firstName: "Owen", lastName: "Lee", email: "owen.lee@northstar.example", title: "Director of Sales Systems", role: "Champion" },
    ],
    snapshots: defaultSnapshots("NEGOTIATION", "COMMIT", 185000, daysFromBase(18)),
    sources: [
      { externalId: "SRC-001-A", type: SourceType.MEETING_NOTE, visibility: SourceVisibility.TEAM, title: "Mutual action plan review", author: "Alex Rivera", occurredAt: timestamp(-1, 16), contactExternalId: "CON-001-A", body: "Priya confirmed budget, signature path, and final redlines. Next step is procurement call on 2026-06-02.", matchedText: "budget, signature path, and final redlines" },
    ],
  },
  {
    externalId: "OPP-002-MISSING-DM",
    account: { externalId: "ACC-002", name: "Beacon Health", website: "https://beacon.example", industry: "Healthcare", segment: "Mid-Market", ownerName: "Morgan Chen" },
    name: "Beacon Health - New Platform",
    stage: "DISCOVERY",
    forecastCategory: "PIPELINE",
    amount: 92000,
    closeDate: daysFromBase(45),
    ownerName: "Morgan Chen",
    description: "Decision-maker has not been identified despite active discovery.",
    contacts: [{ externalId: "CON-002-A", firstName: "Sam", lastName: "Patel", email: "sam.patel@beacon.example", title: "Business Analyst", role: "Evaluator", isPrimary: true }],
    snapshots: [...defaultSnapshots("DISCOVERY", "PIPELINE", 92000, daysFromBase(45)), { fieldName: "DecisionMaker__c", fieldLabel: "Decision Maker", dataType: "text", value: "" }],
    sources: [
      { externalId: "SRC-002-A", type: SourceType.CALL_TRANSCRIPT, visibility: SourceVisibility.INTERNAL, title: "Discovery call transcript", author: "Morgan Chen", occurredAt: timestamp(-2, 18), contactExternalId: "CON-002-A", body: "Sam is collecting requirements but said the budget owner and final signer are still unknown.", matchedText: "final signer are still unknown" },
    ],
  },
  {
    externalId: "OPP-003-STALE-NEXT-STEP",
    account: { externalId: "ACC-003", name: "Canyon Retail Group", website: "https://canyon.example", industry: "Retail", segment: "Enterprise", ownerName: "Jamie Brooks" },
    name: "Canyon Retail Group - Renewal Rescue",
    stage: "PROPOSAL",
    forecastCategory: "BEST_CASE",
    amount: 134000,
    closeDate: daysFromBase(25),
    ownerName: "Jamie Brooks",
    description: "Next step date is stale and should be refreshed.",
    contacts: [{ externalId: "CON-003-A", firstName: "Lena", lastName: "Ortiz", email: "lena.ortiz@canyon.example", title: "Procurement Lead", role: "Procurement", isPrimary: true }],
    snapshots: [...defaultSnapshots("PROPOSAL", "BEST_CASE", 134000, daysFromBase(25)), { fieldName: "NextStep", fieldLabel: "Next Step", dataType: "text", value: "Send revised proposal by 2026-05-10" }],
    sources: [
      { externalId: "SRC-003-A", type: SourceType.EMAIL, visibility: SourceVisibility.TEAM, title: "Revised proposal request", author: "Lena Ortiz", occurredAt: timestamp(-20, 14), contactExternalId: "CON-003-A", body: "Please send the revised proposal by 2026-05-10 so procurement can review before month end.", matchedText: "revised proposal by 2026-05-10" },
    ],
  },
  {
    externalId: "OPP-004-COMMIT-PROCUREMENT",
    account: { externalId: "ACC-004", name: "Summit Manufacturing", website: "https://summit.example", industry: "Manufacturing", segment: "Enterprise", ownerName: "Taylor Smith" },
    name: "Summit Manufacturing - Global Rollout",
    stage: "NEGOTIATION",
    forecastCategory: "COMMIT",
    amount: 410000,
    closeDate: daysFromBase(7),
    ownerName: "Taylor Smith",
    description: "Commit deal currently blocked by procurement vendor onboarding.",
    contacts: [{ externalId: "CON-004-A", firstName: "Grace", lastName: "Kim", email: "grace.kim@summit.example", title: "CFO", role: "Economic Buyer", isPrimary: true }],
    snapshots: [...defaultSnapshots("NEGOTIATION", "COMMIT", 410000, daysFromBase(7)), { fieldName: "ProcurementStatus__c", fieldLabel: "Procurement Status", dataType: "text", value: "Not started" }],
    sources: [
      { externalId: "SRC-004-A", type: SourceType.EMAIL, visibility: SourceVisibility.INTERNAL, title: "Vendor onboarding blocker", author: "Grace Kim", occurredAt: timestamp(-1, 20), contactExternalId: "CON-004-A", body: "Finance approves the purchase, but procurement cannot issue a PO until vendor onboarding and insurance review are complete.", matchedText: "cannot issue a PO until vendor onboarding" },
    ],
  },
  {
    externalId: "OPP-005-UNREALISTIC-CLOSE",
    account: { externalId: "ACC-005", name: "Harbor Logistics", website: "https://harbor.example", industry: "Logistics", segment: "Mid-Market", ownerName: "Nina Park" },
    name: "Harbor Logistics - Routing Optimization",
    stage: "DISCOVERY",
    forecastCategory: "BEST_CASE",
    amount: 76000,
    closeDate: daysFromBase(2),
    ownerName: "Nina Park",
    description: "Close date is unrealistic because demo and legal review have not occurred.",
    contacts: [{ externalId: "CON-005-A", firstName: "Victor", lastName: "Nguyen", email: "victor.nguyen@harbor.example", title: "Operations Director", role: "Champion", isPrimary: true }],
    snapshots: defaultSnapshots("DISCOVERY", "BEST_CASE", 76000, daysFromBase(2)),
    sources: [
      { externalId: "SRC-005-A", type: SourceType.MEETING_NOTE, visibility: SourceVisibility.TEAM, title: "Discovery recap", author: "Nina Park", occurredAt: timestamp(-1, 17), contactExternalId: "CON-005-A", body: "Victor asked to schedule the first technical demo next week; legal has not reviewed contract terms yet.", matchedText: "first technical demo next week" },
    ],
  },
  {
    externalId: "OPP-006-STAGE-MISMATCH",
    account: { externalId: "ACC-006", name: "Aster University", website: "https://aster.example", industry: "Education", segment: "Enterprise", ownerName: "Chris Gomez" },
    name: "Aster University - Student Success Suite",
    stage: "PROPOSAL",
    forecastCategory: "PIPELINE",
    amount: 210000,
    closeDate: daysFromBase(35),
    ownerName: "Chris Gomez",
    description: "CRM says proposal, but source evidence says the customer is still in discovery.",
    contacts: [{ externalId: "CON-006-A", firstName: "Helen", lastName: "Moore", email: "helen.moore@aster.example", title: "Dean of Student Success", role: "Evaluator", isPrimary: true }],
    snapshots: defaultSnapshots("PROPOSAL", "PIPELINE", 210000, daysFromBase(35)),
    sources: [
      { externalId: "SRC-006-A", type: SourceType.CALL_TRANSCRIPT, visibility: SourceVisibility.INTERNAL, title: "Requirements workshop", author: "Chris Gomez", occurredAt: timestamp(-3, 16), contactExternalId: "CON-006-A", body: "Helen said they are still defining requirements and are not ready for a commercial proposal.", matchedText: "not ready for a commercial proposal" },
    ],
  },
  {
    externalId: "OPP-007-FORECAST-MISMATCH",
    account: { externalId: "ACC-007", name: "Pioneer Energy", website: "https://pioneer.example", industry: "Energy", segment: "Enterprise", ownerName: "Riley Stone" },
    name: "Pioneer Energy - Compliance Analytics",
    stage: "NEGOTIATION",
    forecastCategory: "PIPELINE",
    amount: 320000,
    closeDate: daysFromBase(14),
    ownerName: "Riley Stone",
    description: "Source indicates verbal commit while CRM forecast remains pipeline.",
    contacts: [{ externalId: "CON-007-A", firstName: "Marco", lastName: "Silva", email: "marco.silva@pioneer.example", title: "VP Compliance", role: "Decision Maker", isPrimary: true }],
    snapshots: defaultSnapshots("NEGOTIATION", "PIPELINE", 320000, daysFromBase(14)),
    sources: [
      { externalId: "SRC-007-A", type: SourceType.EMAIL, visibility: SourceVisibility.TEAM, title: "Verbal commit email", author: "Marco Silva", occurredAt: timestamp(-1, 13), contactExternalId: "CON-007-A", body: "We are committed to moving forward this quarter pending final paperwork.", matchedText: "committed to moving forward" },
    ],
  },
  {
    externalId: "OPP-008-LEGAL-PENDING",
    account: { externalId: "ACC-008", name: "Evergreen Finance", website: "https://evergreen.example", industry: "Financial Services", segment: "Enterprise", ownerName: "Dana Wright" },
    name: "Evergreen Finance - Risk Portal",
    stage: "NEGOTIATION",
    forecastCategory: "BEST_CASE",
    amount: 275000,
    closeDate: daysFromBase(12),
    ownerName: "Dana Wright",
    description: "Legal terms are pending customer counsel review.",
    contacts: [{ externalId: "CON-008-A", firstName: "Amelia", lastName: "Grant", email: "amelia.grant@evergreen.example", title: "General Counsel", role: "Legal", isPrimary: true }],
    snapshots: [...defaultSnapshots("NEGOTIATION", "BEST_CASE", 275000, daysFromBase(12)), { fieldName: "LegalStatus__c", fieldLabel: "Legal Status", dataType: "text", value: "Pending customer redlines" }],
    sources: [
      { externalId: "SRC-008-A", type: SourceType.DOCUMENT, visibility: SourceVisibility.INTERNAL, title: "MSA redline v3", author: "Amelia Grant", occurredAt: timestamp(-2, 19), contactExternalId: "CON-008-A", uri: "file://evergreen/msa-redline-v3.docx", body: "Customer legal returned redlines and needs limitation of liability language resolved before signature.", matchedText: "limitation of liability language resolved" },
    ],
  },
  {
    externalId: "OPP-009-SECURITY-PENDING",
    account: { externalId: "ACC-009", name: "Nimbus Bank", website: "https://nimbus.example", industry: "Financial Services", segment: "Enterprise", ownerName: "Elliot Young" },
    name: "Nimbus Bank - Data Quality Hub",
    stage: "PROPOSAL",
    forecastCategory: "BEST_CASE",
    amount: 198000,
    closeDate: daysFromBase(20),
    ownerName: "Elliot Young",
    description: "Security questionnaire remains open.",
    contacts: [{ externalId: "CON-009-A", firstName: "Iris", lastName: "Kowalski", email: "iris.kowalski@nimbus.example", title: "Security Architect", role: "Security Reviewer", isPrimary: true }],
    snapshots: [...defaultSnapshots("PROPOSAL", "BEST_CASE", 198000, daysFromBase(20)), { fieldName: "SecurityReview__c", fieldLabel: "Security Review", dataType: "text", value: "In progress" }],
    sources: [
      { externalId: "SRC-009-A", type: SourceType.SUPPORT_TICKET, visibility: SourceVisibility.INTERNAL, title: "Security questionnaire follow-up", author: "Iris Kowalski", occurredAt: timestamp(-4, 15), contactExternalId: "CON-009-A", body: "Security review is pending SOC 2 bridge letter and data retention answers.", matchedText: "pending SOC 2 bridge letter" },
    ],
  },
  {
    externalId: "OPP-010-NO-ACTIVITY-21",
    account: { externalId: "ACC-010", name: "Redwood Media", website: "https://redwood.example", industry: "Media", segment: "Mid-Market", ownerName: "Avery Brown" },
    name: "Redwood Media - Audience Insights",
    stage: "QUALIFICATION",
    forecastCategory: "PIPELINE",
    amount: 54000,
    closeDate: daysFromBase(50),
    ownerName: "Avery Brown",
    description: "No activity for 21 days; only stale activity exists.",
    contacts: [{ externalId: "CON-010-A", firstName: "Noah", lastName: "Price", email: "noah.price@redwood.example", title: "Marketing Ops Manager", role: "Evaluator", isPrimary: true }],
    snapshots: [...defaultSnapshots("QUALIFICATION", "PIPELINE", 54000, daysFromBase(50)), { fieldName: "LastActivityDate", fieldLabel: "Last Activity Date", dataType: "date", value: daysFromBase(-21).toISOString().slice(0, 10) }],
    sources: [
      { externalId: "SRC-010-A", type: SourceType.CRM_NOTE, visibility: SourceVisibility.TEAM, title: "Qualification note", author: "Avery Brown", occurredAt: timestamp(-21, 12), contactExternalId: "CON-010-A", body: "Left voicemail and sent qualification questions. No response since this activity.", matchedText: "No response since this activity" },
    ],
  },
  {
    externalId: "OPP-011-CONFLICTING-NOTES",
    account: { externalId: "ACC-011", name: "Bluebird Robotics", website: "https://bluebird.example", industry: "Robotics", segment: "Growth", ownerName: "Jordan Reed" },
    name: "Bluebird Robotics - Fleet Analytics",
    stage: "NEGOTIATION",
    forecastCategory: "COMMIT",
    amount: 146000,
    closeDate: daysFromBase(10),
    ownerName: "Jordan Reed",
    description: "Multiple notes conflict on budget approval, decision-maker, and close timing.",
    contacts: [{ externalId: "CON-011-A", firstName: "Maya", lastName: "Lin", email: "maya.lin@bluebird.example", title: "COO", role: "Economic Buyer", isPrimary: true }],
    snapshots: defaultSnapshots("NEGOTIATION", "COMMIT", 146000, daysFromBase(10)),
    sources: [
      { externalId: "SRC-011-A", type: SourceType.MEETING_NOTE, visibility: SourceVisibility.TEAM, title: "Budget approved note", author: "Jordan Reed", occurredAt: timestamp(-5, 15), contactExternalId: "CON-011-A", body: "Maya stated budget is approved and signature is targeted for next Friday.", matchedText: "budget is approved" },
      { externalId: "SRC-011-B", type: SourceType.EMAIL, visibility: SourceVisibility.TEAM, title: "Budget not approved email", author: "Maya Lin", occurredAt: timestamp(-2, 11), contactExternalId: "CON-011-A", body: "Budget is not approved yet because the board moved the vote to next month.", matchedText: "Budget is not approved yet" },
      { externalId: "SRC-011-C", type: SourceType.CRM_NOTE, visibility: SourceVisibility.INTERNAL, title: "Decision-maker uncertainty", author: "Jordan Reed", occurredAt: timestamp(-1, 17), contactExternalId: "CON-011-A", body: "Maya may not be the final signer; CFO approval could be required.", matchedText: "may not be the final signer" },
    ],
  },
  {
    externalId: "OPP-012-AMBIGUOUS-MATCH",
    account: { externalId: "ACC-012", name: "Acme Data", website: "https://acmedata.example", industry: "Data Services", segment: "SMB", ownerName: "Quinn Taylor" },
    name: "Acme Data - Starter Pack",
    stage: "DISCOVERY",
    forecastCategory: "PIPELINE",
    amount: 24000,
    closeDate: daysFromBase(40),
    ownerName: "Quinn Taylor",
    description: "Ambiguous source matching case for similarly named Acme entities.",
    contacts: [{ externalId: "CON-012-A", firstName: "Ethan", lastName: "Cole", email: "ethan.cole@acmedata.example", title: "Founder", role: "Decision Maker", isPrimary: true }],
    snapshots: defaultSnapshots("DISCOVERY", "PIPELINE", 24000, daysFromBase(40)),
    sources: [
      { externalId: "SRC-012-A", type: SourceType.EMAIL, visibility: SourceVisibility.TEAM, title: "Acme follow-up", author: "Ethan Cole", occurredAt: timestamp(-1, 10), contactExternalId: "CON-012-A", body: "Following up on Acme next steps; note this message could match Acme Data or Acme Devices in the CRM.", matchedText: "Acme next steps" },
    ],
  },
  {
    externalId: "OPP-013-NO-NOTES",
    account: { externalId: "ACC-013", name: "Silent Springs", website: "https://silent.example", industry: "Hospitality", segment: "SMB", ownerName: "Lee Carter" },
    name: "Silent Springs - Guest Messaging",
    stage: "PROSPECTING",
    forecastCategory: "PIPELINE",
    amount: 18000,
    closeDate: daysFromBase(60),
    ownerName: "Lee Carter",
    description: "Edge scenario: opportunity intentionally has no notes or source items.",
    contacts: [{ externalId: "CON-013-A", firstName: "Rosa", lastName: "Diaz", email: "rosa.diaz@silent.example", title: "Owner", role: "Prospect", isPrimary: true }],
    snapshots: [...defaultSnapshots("PROSPECTING", "PIPELINE", 18000, daysFromBase(60)), { fieldName: "NotesCount__c", fieldLabel: "Notes Count", dataType: "number", value: "0" }],
    sources: [],
  },
  {
    externalId: "OPP-014-DUPLICATE-NOTES",
    account: { externalId: "ACC-014", name: "Parallel Foods", website: "https://parallel.example", industry: "Food & Beverage", segment: "Mid-Market", ownerName: "Casey Nguyen" },
    name: "Parallel Foods - Quality Automation",
    stage: "PROPOSAL",
    forecastCategory: "BEST_CASE",
    amount: 88000,
    closeDate: daysFromBase(28),
    ownerName: "Casey Nguyen",
    description: "Edge scenario: duplicate notes should be de-duplicated by consumers.",
    contacts: [{ externalId: "CON-014-A", firstName: "Theo", lastName: "Harris", email: "theo.harris@parallel.example", title: "Quality VP", role: "Champion", isPrimary: true }],
    snapshots: defaultSnapshots("PROPOSAL", "BEST_CASE", 88000, daysFromBase(28)),
    sources: [
      { externalId: "SRC-014-A", type: SourceType.CRM_NOTE, visibility: SourceVisibility.TEAM, title: "Demo success note", author: "Casey Nguyen", occurredAt: timestamp(-3, 16), contactExternalId: "CON-014-A", body: "Demo completed successfully. Theo requested a formal proposal by Friday.", matchedText: "formal proposal by Friday" },
      { externalId: "SRC-014-B", type: SourceType.CRM_NOTE, visibility: SourceVisibility.TEAM, title: "Demo success note copy", author: "Casey Nguyen", occurredAt: timestamp(-3, 16), contactExternalId: "CON-014-A", body: "Demo completed successfully. Theo requested a formal proposal by Friday.", duplicateOf: "SRC-014-A", matchedText: "formal proposal by Friday" },
    ],
  },
  {
    externalId: "OPP-015-OLD-NOTES-ONLY",
    account: { externalId: "ACC-015", name: "Legacy Motors", website: "https://legacy.example", industry: "Automotive", segment: "Enterprise", ownerName: "Pat Morgan" },
    name: "Legacy Motors - Dealer Portal",
    stage: "QUALIFICATION",
    forecastCategory: "PIPELINE",
    amount: 125000,
    closeDate: daysFromBase(90),
    ownerName: "Pat Morgan",
    description: "Edge scenario: only old notes are available.",
    contacts: [{ externalId: "CON-015-A", firstName: "Uma", lastName: "Rao", email: "uma.rao@legacy.example", title: "IT Director", role: "Evaluator", isPrimary: true }],
    snapshots: defaultSnapshots("QUALIFICATION", "PIPELINE", 125000, daysFromBase(90)),
    sources: [
      { externalId: "SRC-015-A", type: SourceType.MEETING_NOTE, visibility: SourceVisibility.TEAM, title: "Initial interest", author: "Pat Morgan", occurredAt: timestamp(-120, 14), contactExternalId: "CON-015-A", body: "Initial interest captured last quarter; no current requirements confirmed.", matchedText: "last quarter" },
    ],
  },
  {
    externalId: "OPP-016-PRIVATE-SOURCE-NO-CONTACTS",
    account: { externalId: "ACC-016", name: "Cobalt Labs", website: "https://cobalt.example", industry: "Biotech", segment: "Growth", ownerName: "Harper Lane" },
    name: "Cobalt Labs - Research Workspace",
    stage: "DISCOVERY",
    forecastCategory: "PIPELINE",
    amount: 67000,
    closeDate: daysFromBase(33),
    ownerName: "Harper Lane",
    description: "Edge scenario: private source item and no contacts linked to the opportunity.",
    contacts: [],
    snapshots: [...defaultSnapshots("DISCOVERY", "PIPELINE", 67000, daysFromBase(33)), { fieldName: "ContactCount__c", fieldLabel: "Contact Count", dataType: "number", value: "0" }],
    sources: [
      { externalId: "SRC-016-A", type: SourceType.EMAIL, visibility: SourceVisibility.PRIVATE, title: "Private AE note about Cobalt", author: "Harper Lane", occurredAt: timestamp(-2, 9), body: "Private note: sponsor is interested but has not authorized sharing internal org details with the wider team.", authorized: false, authorizationScope: "owner-only", matchedText: "has not authorized sharing" },
    ],
  },
];

async function main() {
  console.log(`Seeding deterministic CRM hygiene fixtures anchored at ${BASE_NOW.toISOString()}`);

  await prisma.feedbackEvent.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.approvalAction.deleteMany();
  await prisma.recommendation.deleteMany();
  await prisma.hygieneScore.deleteMany();
  await prisma.fieldComparison.deleteMany();
  await prisma.extractedFact.deleteMany();
  await prisma.sourceItem.deleteMany();
  await prisma.cRMFieldSnapshot.deleteMany();
  await prisma.opportunityContact.deleteMany();
  await prisma.opportunity.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.account.deleteMany();

  for (const fixture of fixtures) {
    const account = await prisma.account.create({
      data: {
        id: fixture.account.externalId,
        ...fixture.account,
      },
    });

    const contacts = new Map<string, { id: string; externalId: string }>();
    for (const contact of fixture.contacts) {
      const created = await prisma.contact.create({
        data: {
          id: contact.externalId,
          accountId: account.id,
          externalId: contact.externalId,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          title: contact.title,
        },
      });
      contacts.set(contact.externalId, { id: created.id, externalId: contact.externalId });
    }

    const opportunity = await prisma.opportunity.create({
      data: {
        id: fixture.externalId,
        accountId: account.id,
        externalId: fixture.externalId,
        name: fixture.name,
        stage: fixture.stage,
        forecastCategory: fixture.forecastCategory,
        amount: fixture.amount,
        closeDate: fixture.closeDate,
        ownerName: fixture.ownerName,
        description: fixture.description,
      },
    });

    for (const contact of fixture.contacts) {
      const created = contacts.get(contact.externalId);
      if (!created) {
        throw new Error(`Missing contact ${contact.externalId}`);
      }
      await prisma.opportunityContact.create({
        data: {
          opportunityId: opportunity.id,
          contactId: created.id,
          role: contact.role,
          isPrimary: contact.isPrimary ?? false,
        },
      });
    }

    for (const [index, snapshot] of fixture.snapshots.entries()) {
      await prisma.cRMFieldSnapshot.create({
        data: {
          id: `${fixture.externalId}-SNAP-${index + 1}`,
          opportunityId: opportunity.id,
          fieldName: snapshot.fieldName,
          fieldLabel: snapshot.fieldLabel,
          dataType: snapshot.dataType,
          value: snapshot.value,
          sourceSystem: "salesforce-fixture",
          capturedAt: new Date(BASE_NOW.getTime() + index * 1000),
        },
      });
    }

    for (const source of fixture.sources) {
      const contact = source.contactExternalId ? contacts.get(source.contactExternalId) : undefined;
      await prisma.sourceItem.create({
        data: {
          id: source.externalId,
          accountId: account.id,
          opportunityId: opportunity.id,
          contactId: contact?.id,
          type: source.type,
          visibility: source.visibility,
          title: source.title,
          uri: source.uri ?? `fixture://${source.externalId}`,
          body: source.body,
          occurredAt: source.occurredAt,
          ingestedAt: BASE_NOW,
          metadataJson: metadata({
            author: source.author,
            externalId: source.externalId,
            sourceSystem: "fixture-seed",
            linkedRecordType: "Opportunity",
            linkedRecordExternalId: fixture.externalId,
            authorized: source.authorized ?? true,
            authorizationScope: source.authorizationScope ?? source.visibility.toLowerCase(),
            duplicateOf: source.duplicateOf,
            matchedText: source.matchedText,
          }),
        },
      });
    }
  }

  const opportunityCount = await prisma.opportunity.count();
  const snapshotCount = await prisma.cRMFieldSnapshot.count();
  const sourceCount = await prisma.sourceItem.count();
  console.log(`Seeded ${opportunityCount} opportunities, ${snapshotCount} CRM field snapshots, and ${sourceCount} source items.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
