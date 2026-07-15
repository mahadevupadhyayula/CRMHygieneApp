import { approvalRecommendationSchema, type ApprovalRecommendation } from "../agents/approval";
import type { RecommendationCard } from "../agents/recommendation";

export function recommendationCardToApprovalRecommendation(card: RecommendationCard, now = new Date()): ApprovalRecommendation {
  return approvalRecommendationSchema.parse({
    id: card.id,
    opportunityId: card.opportunityId,
    actionType: card.actionType,
    crmField: card.crmField,
    riskLevel: card.riskLevel,
    status: card.status === "blocked" || card.approvalPolicy === "blocked" || card.approvalPolicy === "draft_only" ? "cancelled" : "pending",
    currentValue: card.currentCrmValue,
    suggestedValue: card.suggestedValue,
    evidence: card.evidence.map((item) => ({ sourceId: item.sourceId, factId: item.factId, evidenceText: item.evidenceText, available: item.validationStatus === "valid" })),
    createdAt: now,
    updatedAt: now,
    version: 0,
  });
}

export function recommendationCardsToApprovalRecommendations(cards: RecommendationCard[], now = new Date()): ApprovalRecommendation[] {
  return cards.filter((card) => card.opportunityId && card.actionType !== "draft_internal_message" && card.actionType !== "request_manager_review" && card.actionType !== "snooze_reminder").map((card) => recommendationCardToApprovalRecommendation(card, now));
}
