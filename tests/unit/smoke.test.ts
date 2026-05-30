import { describe, expect, it } from "vitest";

describe("Vitest smoke test", () => {
  it("confirms the unit test runner is wired", () => {
    expect("CRM Hygiene Agent").toContain("Hygiene");
  });
});
