import type { z } from "zod";

import type {
  dimensionScoreSchema,
  forecastRiskLevelSchema,
  hygieneDimensionSchema,
  hygieneScoreResultSchema,
  scoringContextSchema,
  scoringCrmSnapshotSchema,
  scoringEvidenceSchema,
  scoringOptionsSchema,
  scoringOpportunitySchema,
} from "./schemas";

export type HygieneDimension = z.infer<typeof hygieneDimensionSchema>;
export type ForecastRiskLevel = z.infer<typeof forecastRiskLevelSchema>;
export type ScoringEvidence = z.infer<typeof scoringEvidenceSchema>;
export type DimensionScore = z.infer<typeof dimensionScoreSchema>;
export type HygieneScoreResult = z.infer<typeof hygieneScoreResultSchema>;
export type ScoringOpportunity = z.infer<typeof scoringOpportunitySchema>;
export type ScoringCRMSnapshot = z.infer<typeof scoringCrmSnapshotSchema>;
export type ScoringOptions = z.input<typeof scoringOptionsSchema>;
export type ScoringContext = z.input<typeof scoringContextSchema>;
