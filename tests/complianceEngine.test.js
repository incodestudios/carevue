import test from "node:test";
import assert from "node:assert/strict";
import { computePredictiveComplianceScoreFromData } from "../services/complianceEngine.js";

test("penalizes missing clock-in and clock-out", () => {
  const plan = {
    serviceCode: "SVC1",
    externalIds: { caregiver: "CG1", patient: "PT1" },
  };

  const result = computePredictiveComplianceScoreFromData({ plan, events: [] });

  assert.equal(result.score, 70);
  assert.equal(result.riskBucket, "RISK");
  assert.equal(result.failedRules.length, 2);
});

test("hard fails when clock-out precedes clock-in", () => {
  const plan = {
    serviceCode: "SVC1",
    externalIds: { caregiver: "CG1", patient: "PT1" },
  };
  const actual = {
    actualStartUtc: new Date("2024-01-02T10:00:00Z"),
    actualEndUtc: new Date("2024-01-02T09:00:00Z"),
  };

  const result = computePredictiveComplianceScoreFromData({ plan, actual, events: [] });

  assert.equal(result.score, 0);
  assert.equal(result.riskBucket, "LIKELY_FAIL");
  assert.ok(
    result.failedRules.some((rule) => rule.ruleId === "clock_out_before_clock_in")
  );
});
