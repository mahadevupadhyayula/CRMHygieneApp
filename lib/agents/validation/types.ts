import type { z } from "zod";

import type {
  validationActionRiskSchema,
  validationContextSchema,
  validationEvidenceStatusSchema,
  validationFactSchema,
  validationOptionsSchema,
  validationResultListSchema,
  validationResultSchema,
  validationSourceSchema,
  validationStatusSchema,
} from "./schemas";

export type ValidationStatus = z.infer<typeof validationStatusSchema>;
export type ValidationActionRisk = z.infer<typeof validationActionRiskSchema>;
export type ValidationEvidenceStatus = z.infer<typeof validationEvidenceStatusSchema>;
export type ValidationSource = z.infer<typeof validationSourceSchema>;
export type ValidationFact = z.infer<typeof validationFactSchema>;
export type ValidationOptions = z.input<typeof validationOptionsSchema>;
export type ValidationContext = z.input<typeof validationContextSchema>;
export type ValidationResult = z.infer<typeof validationResultSchema>;
export type ValidationResultList = z.infer<typeof validationResultListSchema>;
