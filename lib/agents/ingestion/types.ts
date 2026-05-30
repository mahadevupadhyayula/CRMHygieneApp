import type { z } from "zod";

import type {
  accountContextSchema,
  activityHistoryItemSchema,
  contactContextSchema,
  crmSnapshotContextSchema,
  dealContextPackageSchema,
  ingestionMetadataSchema,
  ingestionWarningCodeSchema,
  ingestionWarningSchema,
  ingestionWarningSeveritySchema,
  opportunityContextSchema,
  sourceItemContextSchema,
  sourceMetadataSchema,
} from "./schemas";

export type IngestionWarningSeverity = z.infer<typeof ingestionWarningSeveritySchema>;
export type IngestionWarningCode = z.infer<typeof ingestionWarningCodeSchema>;
export type IngestionWarning = z.infer<typeof ingestionWarningSchema>;
export type SourceMetadata = z.infer<typeof sourceMetadataSchema>;
export type AccountContext = z.infer<typeof accountContextSchema>;
export type OpportunityContext = z.infer<typeof opportunityContextSchema>;
export type ContactContext = z.infer<typeof contactContextSchema>;
export type CRMSnapshotContext = z.infer<typeof crmSnapshotContextSchema>;
export type SourceItemContext = z.infer<typeof sourceItemContextSchema>;
export type ActivityHistoryItem = z.infer<typeof activityHistoryItemSchema>;
export type IngestionMetadata = z.infer<typeof ingestionMetadataSchema>;
export type DealContextPackage = z.infer<typeof dealContextPackageSchema>;

export class OpportunityNotFoundError extends Error {
  readonly code = "MISSING_OPPORTUNITY";
  readonly opportunityId: string;

  constructor(opportunityId: string) {
    super(`Opportunity ${opportunityId} was not found.`);
    this.name = "OpportunityNotFoundError";
    this.opportunityId = opportunityId;
  }
}
