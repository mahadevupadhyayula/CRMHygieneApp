import type { z } from "zod";

import type {
  crmFieldMappingSchema,
  extractedFactListSchema,
  extractedFactSchema,
  extractedFactTypeSchema,
  extractionConfidenceBandSchema,
  extractionContactSchema,
  extractionContextSchema,
  extractionOpportunitySchema,
  extractionSourceItemSchema,
  sourceItemMatchStatusSchema,
} from "./schemas";

export type ExtractedFactType = z.infer<typeof extractedFactTypeSchema>;
export type ExtractionConfidenceBand = z.infer<typeof extractionConfidenceBandSchema>;
export type SourceItemMatchStatus = z.infer<typeof sourceItemMatchStatusSchema>;
export type CRMFieldMapping = z.infer<typeof crmFieldMappingSchema>;
export type ExtractedFact = z.infer<typeof extractedFactSchema>;
export type ExtractedFactList = z.infer<typeof extractedFactListSchema>;
export type ExtractionSourceItem = z.infer<typeof extractionSourceItemSchema>;
export type ExtractionContact = z.infer<typeof extractionContactSchema>;
export type ExtractionOpportunity = z.infer<typeof extractionOpportunitySchema>;
export type ExtractionContext = z.input<typeof extractionContextSchema>;
