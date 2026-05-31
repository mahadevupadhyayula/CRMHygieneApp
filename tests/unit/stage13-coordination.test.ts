import { describe, expect, it } from "vitest";

import { coordinationActionSchema, generateCoordinationActions, type CoordinationAction, type CoordinationContext } from "../../lib/agents/coordination";
import type { FieldComparison } from "../../lib/agents/comparison";
import type { ValidationFact, ValidationResult } from "../../lib/agents/validation";

const sourceTimestamp = new Date("2026-05-30T12:00:00Z");

describe("Stage 13 coordination actions", () => {
  it("creates an SE task for a technical blocker", () => {
    const actions = run({ facts: [fact({ factType: "risk", normalizedValue: "Technical blocker on SSO integration is unresolved", evidenceText: "Customer is blocked on SSO architecture review." })] });

    expect(find(actions, "assign_se_task")).toEqual(expect.objectContaining({ ownerRole: "sales_engineer", suggestedOwner: "Sam SE", status: "ready", approvalRequired: false }));
  });

  it("creates a legal owner task for a legal blocker", () => {
    const actions = run({ facts: [fact({ factType: "legal_status", normalizedValue: "Legal pending MSA redlines" })] });

    expect(find(actions, "notify_legal_owner")).toEqual(expect.objectContaining({ ownerRole: "legal", suggestedOwner: "Lee Legal" }));
  });

  it("creates a security task for a security questionnaire", () => {
    const actions = run({ facts: [fact({ factType: "security_status", normalizedValue: "Security questionnaire pending" })] });

    expect(find(actions, "assign_security_task")).toEqual(expect.objectContaining({ ownerRole: "security", suggestedOwner: "Sid Security" }));
  });

  it("creates a deal desk task for a pricing approval blocker", () => {
    const actions = run({ facts: [fact({ factType: "risk", normalizedValue: "Pricing approval blocked by discount exception", evidenceText: "Deal desk approval is pending for the quote." })] });

    expect(find(actions, "assign_deal_desk_task")).toEqual(expect.objectContaining({ ownerRole: "deal_desk", suggestedOwner: "Dana DealDesk" }));
  });

  it("falls back to finance when deal desk is unavailable for pricing approval", () => {
    const actions = run({
      facts: [fact({ factType: "risk", normalizedValue: "Pricing approval blocked by discount exception", evidenceText: "Finance approval is pending for the quote." })],
      options: { owners: { finance: "Fran Finance" } },
    });

    expect(find(actions, "assign_deal_desk_task")).toEqual(expect.objectContaining({ ownerRole: "deal_desk", suggestedOwner: "Fran Finance" }));
  });

  it("creates an AE task when the CFO is missing", () => {
    const actions = run({ facts: [fact({ factType: "internal_owner_needed", normalizedValue: "CFO not engaged and economic buyer missing", evidenceText: "Rep notes say CFO not engaged." })] });

    expect(find(actions, "assign_ae_multithread_task")).toEqual(expect.objectContaining({ ownerRole: "account_executive", suggestedOwner: "Alex AE" }));
  });

  it("creates a no-activity follow-up task", () => {
    const actions = run({ comparisons: [comparison({ crmField: "NextStep", extractedValue: "Schedule follow-up", issueType: "missing_task", severity: "low" })] });

    expect(find(actions, "create_follow_up_task")).toEqual(expect.objectContaining({ ownerRole: "opportunity_owner", suggestedOwner: "Alex AE" }));
  });

  it("creates a manager review for a procurement delay", () => {
    const actions = run({ facts: [fact({ factType: "procurement_status", normalizedValue: "Procurement delayed on vendor setup" })] });

    expect(find(actions, "request_manager_review")).toEqual(expect.objectContaining({ ownerRole: "manager", suggestedOwner: "Morgan Manager" }));
  });

  it("keeps customer-facing document follow-up email draft-only", () => {
    const actions = run({ facts: [fact({ factType: "next_step", normalizedValue: "Customer asked for SOC 2 document", evidenceText: "Customer asked us to send the security packet document." })] });
    const action = find(actions, "draft_customer_follow_up");

    expect(action).toEqual(expect.objectContaining({ customerFacing: true, status: "draft", approvalRequired: true }));
    expect(action.draftMessage).toContain("Draft only — do not auto-send");
  });

  it("requires review for internal messages when configured", () => {
    const actions = run({ facts: [fact({ factType: "legal_status", normalizedValue: "Legal pending DPA" })], options: { requireInternalMessageReview: true } });

    expect(find(actions, "notify_legal_owner")).toEqual(expect.objectContaining({ status: "requires_review", approvalRequired: true }));
  });

  it("blocks an action when the owner is unavailable", () => {
    const actions = run({ facts: [fact({ factType: "security_status", normalizedValue: "Security questionnaire pending" })], options: { owners: { legal: "Lee Legal" } } });

    expect(find(actions, "assign_security_task")).toEqual(expect.objectContaining({ suggestedOwner: null, status: "blocked", blockedReason: expect.stringContaining("No available security owner") }));
  });

  it("chooses the first suggested owner when multiple owners are possible", () => {
    const actions = run({ facts: [fact({ factType: "security_status", normalizedValue: "Security questionnaire pending" })], options: { owners: { security: ["Primary Security", "Backup Security"] } } });

    expect(find(actions, "assign_security_task").suggestedOwner).toBe("Primary Security");
  });

  it("blocks manager review when no manager is assigned", () => {
    const actions = run({ opportunity: { id: "opp-1", ownerName: "Alex AE" }, facts: [fact({ factType: "procurement_status", normalizedValue: "Procurement delay is unresolved" })], options: { owners: { deal_desk: "Dana DealDesk" } } });

    expect(find(actions, "request_manager_review")).toEqual(expect.objectContaining({ suggestedOwner: null, status: "blocked" }));
  });

  it("suppresses an action when a matching task already exists", () => {
    const duplicateKey = "notify_legal_owner|legal|opp-1|fact-1";
    const actions = run({ facts: [fact({ factType: "legal_status", normalizedValue: "Legal pending MSA" })], existingTasks: [{ duplicateKey, status: "ready" }] });

    expect(actions.filter((action) => action.duplicateKey === duplicateKey)).toEqual([]);
  });

  it("prevents customer-facing drafts from being marked auto-send", () => {
    const action = find(run({ facts: [fact({ factType: "next_step", normalizedValue: "Customer asked for security document", evidenceText: "Customer asked to send SOC 2 document." })] }), "draft_customer_follow_up");

    expect(action.status).toBe("draft");
    expect(action.customerFacing).toBe(true);
    expect(() => coordinationActionSchema.parse({ ...action, status: "ready" })).toThrow(/draft-only/);
  });

  it("excludes sensitive evidence from draft messages", () => {
    const actions = run({ facts: [fact({ factType: "risk", normalizedValue: "Technical blocker pending", evidenceText: "Technical blocker includes API key secret abc123 in notes.", metadata: { sensitive: true } })] });
    const action = find(actions, "assign_se_task");

    expect(action.evidence[0]).toEqual(expect.objectContaining({ sensitive: true, evidenceText: expect.stringContaining("Sensitive evidence") }));
    expect(action.draftMessage).not.toContain("abc123");
    expect(action.draftMessage).not.toContain("api key");
  });

  it("deduplicates duplicate coordination actions", () => {
    const actions = run({
      facts: [
        fact({ factId: "same", factType: "legal_status", normalizedValue: "Legal pending MSA", confidence: 0.8 }),
        fact({ factId: "same", factType: "legal_status", normalizedValue: "Legal pending MSA", confidence: 0.95 }),
      ],
      validationResults: [result("same", { confidence: 0.8 }), result("same", { confidence: 0.95 })],
    });

    expect(actions.filter((action) => action.type === "notify_legal_owner")).toHaveLength(1);
  });
});

function run(overrides: Partial<CoordinationContext>): CoordinationAction[] {
  const facts = overrides.facts ?? [];
  const comparisons = overrides.comparisons ?? [];
  const defaultOptions = {
    owners: {
      sales_engineer: "Sam SE",
      legal: "Lee Legal",
      security: "Sid Security",
      deal_desk: "Dana DealDesk",
      finance: "Fran Finance",
      account_executive: "Alex AE",
      manager: "Morgan Manager",
      opportunity_owner: "Alex AE",
    },
  };

  return generateCoordinationActions({
    opportunity: { id: "opp-1", ownerName: "Alex AE", managerName: "Morgan Manager" },
    facts,
    comparisons,
    validationResults: [...facts.map((item) => result(item.factId ?? "fact-1")), ...comparisons.map((item) => result(item.evidence.factId))],
    ...overrides,
    options: { ...defaultOptions, ...overrides.options },
  });
}

function find(actions: CoordinationAction[], type: CoordinationAction["type"]): CoordinationAction {
  const action = actions.find((item) => item.type === type);
  if (!action) throw new Error(`Missing ${type}`);
  return action;
}

function fact(overrides: Partial<ValidationFact> = {}): ValidationFact {
  return {
    factId: "fact-1",
    factType: "risk",
    rawValue: "blocked",
    normalizedValue: "blocked",
    evidenceText: "Evidence says this item is blocked.",
    sourceId: "src-1",
    sourceTimestamp,
    confidence: 0.9,
    confidenceBand: "high",
    suggestedCrmFieldMapping: { objectName: "Opportunity", fieldName: "Risk__c", fieldLabel: "Risk", confidence: 1 },
    recommendationEligible: true,
    sourceMatchStatus: "matched",
    ...overrides,
  };
}

function comparison(overrides: Partial<FieldComparison> = {}): FieldComparison {
  return {
    crmField: "NextStep",
    currentValue: null,
    extractedValue: "Follow up with customer",
    issueType: "missing_task",
    severity: "low",
    evidence: { factId: "comparison-fact-1", sourceId: "src-1", sourceTimestamp, evidenceText: "No activity since last meeting.", validationStatus: "valid", confidence: 0.9 },
    recommendationEligible: true,
    ...overrides,
  };
}

function result(factId: string, overrides: Partial<ValidationResult> = {}): ValidationResult {
  return { factId, status: "valid", reasons: ["VALID"], confidence: 0.9, actionRisk: "low", evidenceStatus: "present", ...overrides };
}
