import { CrmIntegrationError, type CrmObjectType, type HubSpotPage, type HubSpotReadOnlyClient } from "./types";
import { hubSpotPage } from "./index";

export type MockHubSpotPages = Partial<Record<CrmObjectType, HubSpotPage[]>>;

export interface MockHubSpotClientOptions {
  pages: MockHubSpotPages;
  failOn?: Partial<Record<CrmObjectType, CrmIntegrationError>>;
}

export class MockHubSpotReadOnlyClient implements HubSpotReadOnlyClient {
  readonly calls: Array<{ objectType: CrmObjectType; after?: string; limit?: number }> = [];
  readonly writeCalls: unknown[] = [];
  private readonly pages: MockHubSpotPages;
  private readonly failOn: NonNullable<MockHubSpotClientOptions["failOn"]>;

  constructor(options: MockHubSpotClientOptions) {
    this.pages = options.pages;
    this.failOn = options.failOn ?? {};
  }

  async listObjects(input: { objectType: CrmObjectType; after?: string; limit?: number }): Promise<HubSpotPage> {
    this.calls.push(input);
    const failure = this.failOn[input.objectType];
    if (failure) throw failure;

    const pages = this.pages[input.objectType] ?? [hubSpotPage([])];
    if (!input.after) return pages[0] ?? hubSpotPage([]);
    const index = Number(input.after);
    return pages[index] ?? hubSpotPage([]);
  }

  async writeObject(input: unknown): Promise<unknown> {
    this.writeCalls.push(input);
    throw new CrmIntegrationError("READ_ONLY_WRITE_FORBIDDEN", "Mock HubSpot client is read-only.");
  }
}
