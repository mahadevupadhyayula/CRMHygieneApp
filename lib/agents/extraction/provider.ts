import { extractedFactListSchema, extractionContextSchema } from "./schemas";
import type { ExtractedFact, ExtractionContext } from "./types";

export interface AIModelProvider {
  extractDealFacts(context: ExtractionContext): Promise<ExtractedFact[]>;
}

export class StructuredExtractionAgent implements AIModelProvider {
  constructor(private readonly provider: AIModelProvider) {}

  async extractDealFacts(contextInput: ExtractionContext): Promise<ExtractedFact[]> {
    const context = extractionContextSchema.parse(contextInput);
    const facts = await this.provider.extractDealFacts(context);
    return extractedFactListSchema.parse(facts);
  }
}
