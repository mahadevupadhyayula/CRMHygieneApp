import type { z } from "zod";

import type {
  approvalCardStatusSchema,
  approvalPolicySchema,
  existingRecommendationSchema,
  recommendationActionTypeSchema,
  recommendationApprovalLevelSchema,
  recommendationCardListSchema,
  recommendationCardSchema,
  recommendationContextSchema,
  recommendationEvidenceSchema,
  recommendationOptionsSchema,
  recommendationRiskLevelSchema,
} from "./schemas";

export type RecommendationActionType = z.infer<typeof recommendationActionTypeSchema>;
export type RecommendationRiskLevel = z.infer<typeof recommendationRiskLevelSchema>;
export type ApprovalPolicy = z.infer<typeof approvalPolicySchema>;
export type ApprovalCardStatus = z.infer<typeof approvalCardStatusSchema>;
export type RecommendationEvidence = z.infer<typeof recommendationEvidenceSchema>;
export type RecommendationApprovalLevel = z.infer<typeof recommendationApprovalLevelSchema>;
export type RecommendationCard = z.infer<typeof recommendationCardSchema>;
export type RecommendationCardList = z.infer<typeof recommendationCardListSchema>;
export type ExistingRecommendation = z.infer<typeof existingRecommendationSchema>;
export type RecommendationOptions = z.input<typeof recommendationOptionsSchema>;
export type RecommendationContext = z.input<typeof recommendationContextSchema>;
