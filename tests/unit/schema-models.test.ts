import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("prisma/schema.prisma", "utf8");

const getEnumValues = (enumName: string) => {
  const match = schema.match(new RegExp(`enum ${enumName} \\{([\\s\\S]*?)\\n\\}`));
  return match?.[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("//"));
};

const getModelBody = (modelName: string) => {
  const match = schema.match(new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`));
  return match?.[1] ?? "";
};

describe("Stage 1 Prisma schema", () => {
  it("defines the stage enum coverage", () => {
    expect(getEnumValues("OpportunityStage")).toEqual([
      "PROSPECTING",
      "QUALIFICATION",
      "DISCOVERY",
      "PROPOSAL",
      "NEGOTIATION",
      "PROCUREMENT",
      "CLOSED_WON",
      "CLOSED_LOST",
    ]);
    expect(getEnumValues("ForecastCategory")).toEqual(["PIPELINE", "BEST_CASE", "COMMIT", "CLOSED", "OMITTED"]);
    expect(getEnumValues("SourceItemType")).toEqual(["NOTE", "EMAIL", "CALL", "MEETING", "CRM_UPDATE", "SUPPORT_TICKET", "DOCUMENT"]);
    expect(getEnumValues("SourceVisibility")).toEqual(["PUBLIC", "INTERNAL", "PRIVATE", "RESTRICTED"]);
    expect(getEnumValues("SourceAuthorization")).toEqual(["AUTHORIZED", "UNAUTHORIZED", "NEEDS_REVIEW"]);
    expect(getEnumValues("RecommendationStatus")).toEqual(["OPEN", "ACCEPTED", "REJECTED", "APPLIED", "DISMISSED"]);
    expect(getEnumValues("ApprovalStatus")).toEqual(["REQUESTED", "APPROVED", "REJECTED", "CANCELLED"]);
    expect(getEnumValues("AuditEventType")).toContain("SEED_CREATED");
    expect(getEnumValues("AuditEventType")).toContain("FEEDBACK_RECORDED");
  });

  it("contains the required Stage 1 models", () => {
    for (const model of [
      "Account",
      "Contact",
      "Opportunity",
      "CRMFieldSnapshot",
      "SourceItem",
      "ExtractedFact",
      "FieldComparison",
      "HygieneScore",
      "Recommendation",
      "ApprovalAction",
      "AuditEvent",
      "FeedbackEvent",
    ]) {
      expect(schema).toContain(`model ${model} {`);
    }
  });

  it("keeps required fields on core opportunity and evidence models", () => {
    const opportunity = getModelBody("Opportunity");
    expect(opportunity).toContain("accountId         String");
    expect(opportunity).toContain("scenarioKey       String              @unique");
    expect(opportunity).toContain("amountCents       Int");
    expect(opportunity).toContain("stage             OpportunityStage");
    expect(opportunity).toContain("forecastCategory  ForecastCategory");
    expect(opportunity).toContain("closeDate         DateTime");

    const sourceItem = getModelBody("SourceItem");
    expect(sourceItem).toContain("type              SourceItemType");
    expect(sourceItem).toContain("visibility        SourceVisibility");
    expect(sourceItem).toContain("authorName        String");
    expect(sourceItem).toContain("occurredAt        DateTime");
    expect(sourceItem).toContain("authorization     SourceAuthorization @default(AUTHORIZED)");
    expect(sourceItem).toContain("linkedRecordType  String");
    expect(sourceItem).toContain("linkedRecordId    String");
  });

  it("documents relationship assumptions needed by downstream stages", () => {
    expect(getModelBody("Account")).toContain("opportunities  Opportunity[]");
    expect(getModelBody("Contact")).toContain("opportunities  Opportunity[]      @relation(\"OpportunityContacts\")");
    expect(getModelBody("Opportunity")).toContain("contacts          Contact[]           @relation(\"OpportunityContacts\")");
    expect(getModelBody("Opportunity")).toContain("crmFieldSnapshots CRMFieldSnapshot[]");
    expect(getModelBody("Opportunity")).toContain("sourceItems       SourceItem[]");
    expect(getModelBody("Recommendation")).toContain("approvalActions ApprovalAction[]");
  });
});
