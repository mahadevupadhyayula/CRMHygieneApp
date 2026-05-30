import type { z } from "zod";

import type { matchingContactSchema, matchingOpportunitySchema, matchingOptionsSchema, matchingSourceItemSchema, matchingSourceMetadataSchema, sourceMatchSchema, sourceMatchStatusSchema } from "./schemas";

export type SourceMatchStatus = z.infer<typeof sourceMatchStatusSchema>;
export type MatchingContact = z.infer<typeof matchingContactSchema>;
export type MatchingOpportunity = z.infer<typeof matchingOpportunitySchema>;
export type MatchingSourceMetadata = z.infer<typeof matchingSourceMetadataSchema>;
export type MatchingSourceItem = z.infer<typeof matchingSourceItemSchema>;
export type SourceMatch = z.infer<typeof sourceMatchSchema>;
export type MatchingOptions = z.infer<typeof matchingOptionsSchema>;
