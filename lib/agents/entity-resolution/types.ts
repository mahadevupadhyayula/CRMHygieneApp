import type { z } from "zod";

import type {
  entityResolutionAccountSchema,
  entityResolutionContactSchema,
  entityResolutionContextSchema,
  entityResolutionOpportunitySchema,
  entityResolutionOptionsSchema,
  entityResolutionSourceItemSchema,
  entityTypeSchema,
  resolvedEntityListSchema,
  resolvedEntitySchema,
} from "./schemas";

export type EntityType = z.infer<typeof entityTypeSchema>;
export type ResolvedEntity = z.infer<typeof resolvedEntitySchema>;
export type ResolvedEntityList = z.infer<typeof resolvedEntityListSchema>;
export type EntityResolutionContact = z.infer<typeof entityResolutionContactSchema>;
export type EntityResolutionAccount = z.infer<typeof entityResolutionAccountSchema>;
export type EntityResolutionOpportunity = z.infer<typeof entityResolutionOpportunitySchema>;
export type EntityResolutionSourceItem = z.infer<typeof entityResolutionSourceItemSchema>;
export type EntityResolutionContext = z.infer<typeof entityResolutionContextSchema>;
export type EntityResolutionOptions = z.infer<typeof entityResolutionOptionsSchema>;
