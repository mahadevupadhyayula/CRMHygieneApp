import type { z } from "zod";

import type {
  crmAccountSchema,
  crmActivitySchema,
  crmContactSchema,
  crmDealSchema,
  crmFieldSnapshotSchema,
  crmObjectTypeSchema,
  crmOwnerSchema,
  crmPageSchema,
  crmProviderSchema,
  crmRawObjectSchema,
  crmSnapshotSchema,
  crmSyncErrorCodeSchema,
  crmSyncLogSchema,
} from "./schemas";

export type CrmProvider = z.infer<typeof crmProviderSchema>;
export type CrmObjectType = z.infer<typeof crmObjectTypeSchema>;
export type CrmSyncErrorCode = z.infer<typeof crmSyncErrorCodeSchema>;
export type HubSpotRawObject = z.infer<typeof crmRawObjectSchema>;
export type HubSpotPage = z.infer<typeof crmPageSchema>;
export type NormalizedCrmOwner = z.infer<typeof crmOwnerSchema>;
export type NormalizedCrmAccount = z.infer<typeof crmAccountSchema>;
export type NormalizedCrmContact = z.infer<typeof crmContactSchema>;
export type NormalizedCrmDeal = z.infer<typeof crmDealSchema>;
export type NormalizedCrmActivity = z.infer<typeof crmActivitySchema>;
export type NormalizedCrmFieldSnapshot = z.infer<typeof crmFieldSnapshotSchema>;
export type CrmSyncLog = z.infer<typeof crmSyncLogSchema>;
export type CrmSnapshot = z.infer<typeof crmSnapshotSchema>;

export interface HubSpotReadOnlyClient {
  listObjects(input: { objectType: CrmObjectType; after?: string; limit?: number }): Promise<HubSpotPage>;
  writeObject?: (input: unknown) => Promise<unknown>;
}

export interface HubSpotSyncOptions {
  now?: Date;
  pageSize?: number;
  continueOnError?: boolean;
  selectedDealFields?: string[];
  fieldLabels?: Record<string, string>;
  fieldTypes?: Record<string, string>;
  expectedFieldTypes?: Record<string, "string" | "number" | "boolean" | "date">;
  requiredFields?: Partial<Record<CrmObjectType, string[]>>;
}

export class CrmIntegrationError extends Error {
  readonly code: CrmSyncErrorCode;
  readonly objectType?: CrmObjectType;
  readonly retryAfterMs?: number;

  constructor(code: CrmSyncErrorCode, message: string, options: { objectType?: CrmObjectType; retryAfterMs?: number } = {}) {
    super(message);
    this.name = "CrmIntegrationError";
    this.code = code;
    this.objectType = options.objectType;
    this.retryAfterMs = options.retryAfterMs;
  }
}
