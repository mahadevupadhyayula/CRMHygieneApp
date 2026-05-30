import type { z } from "zod";

import type {
  comparisonContextSchema,
  comparisonEvidenceSchema,
  comparisonIssueTypeSchema,
  comparisonOptionsSchema,
  comparisonSeveritySchema,
  crmSnapshotForComparisonSchema,
  fieldComparisonListSchema,
  fieldComparisonSchema,
  opportunityForComparisonSchema,
} from "./schemas";

export type ComparisonIssueType = z.infer<typeof comparisonIssueTypeSchema>;
export type ComparisonSeverity = z.infer<typeof comparisonSeveritySchema>;
export type ComparisonEvidence = z.infer<typeof comparisonEvidenceSchema>;
export type FieldComparison = z.infer<typeof fieldComparisonSchema>;
export type FieldComparisonList = z.infer<typeof fieldComparisonListSchema>;
export type ComparisonCRMField = z.infer<typeof crmSnapshotForComparisonSchema>;
export type ComparisonOpportunity = z.infer<typeof opportunityForComparisonSchema>;
export type ComparisonOptions = z.input<typeof comparisonOptionsSchema>;
export type ComparisonContext = z.input<typeof comparisonContextSchema>;
