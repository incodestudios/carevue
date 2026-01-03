import VisitPlan from "../models/VisitPlan.js";
import VisitActual from "../models/VisitActual.js";
import VisitEvent from "../models/VisitEvent.js";
import ComplianceEvaluation from "../models/ComplianceEvaluation.js";

const DEFAULT_RULES = {
  missingClockIn: { id: "missing_clock_in", penalty: 15, severity: "MEDIUM" },
  missingClockOut: { id: "missing_clock_out", penalty: 15, severity: "MEDIUM" },
  clockOutBeforeClockIn: {
    id: "clock_out_before_clock_in",
    penalty: 100,
    severity: "HARD",
  },
  missingGps: { id: "missing_gps", penalty: 10, severity: "LOW" },
  missingExternalIds: { id: "missing_external_ids", penalty: 10, severity: "LOW" },
  missingServiceCode: { id: "missing_service_code", penalty: 10, severity: "LOW" },
  excessiveManualEdits: { id: "excessive_manual_edits", penalty: 10, severity: "LOW" },
};

const DEFAULT_THRESHOLDS = {
  likelyPassMin: 80,
  riskMin: 60,
  maxManualEdits: 2,
};

function applyPenalty(result, rule, message) {
  result.score = Math.max(0, result.score - rule.penalty);
  result.failedRules.push({
    ruleId: rule.id,
    severity: rule.severity,
    message,
  });
}

function getRiskBucket(score, thresholds) {
  if (score >= thresholds.likelyPassMin) return "LIKELY_PASS";
  if (score >= thresholds.riskMin) return "RISK";
  return "LIKELY_FAIL";
}

function findEvent(events, type) {
  return events.find((event) => event.type === type) || null;
}

export function computePredictiveComplianceScoreFromData({
  plan,
  actual,
  events = [],
  config = {},
} = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...config };
  const result = { score: 100, riskBucket: "LIKELY_PASS", failedRules: [] };

  const clockInEvent = findEvent(events, "CLOCK_IN");
  const clockOutEvent = findEvent(events, "CLOCK_OUT");
  const actualStart = actual?.actualStartUtc || clockInEvent?.timestampUtc || null;
  const actualEnd = actual?.actualEndUtc || clockOutEvent?.timestampUtc || null;

  if (!actualStart) {
    applyPenalty(result, DEFAULT_RULES.missingClockIn, "Missing clock-in.");
  }

  if (!actualEnd) {
    applyPenalty(result, DEFAULT_RULES.missingClockOut, "Missing clock-out.");
  }

  if (actualStart && actualEnd && actualEnd < actualStart) {
    result.score = 0;
    result.failedRules.push({
      ruleId: DEFAULT_RULES.clockOutBeforeClockIn.id,
      severity: DEFAULT_RULES.clockOutBeforeClockIn.severity,
      message: "Clock-out occurred before clock-in.",
    });
  }

  const missingGpsIn = clockInEvent && !(clockInEvent.geo?.lat && clockInEvent.geo?.lng);
  const missingGpsOut = clockOutEvent && !(clockOutEvent.geo?.lat && clockOutEvent.geo?.lng);
  if (missingGpsIn || missingGpsOut) {
    applyPenalty(
      result,
      DEFAULT_RULES.missingGps,
      "Missing GPS coordinates for clock-in/out."
    );
  }

  const caregiverExternalId = plan?.externalIds?.caregiver;
  const patientExternalId = plan?.externalIds?.patient;
  if (!caregiverExternalId || !patientExternalId) {
    applyPenalty(
      result,
      DEFAULT_RULES.missingExternalIds,
      "Missing caregiver or patient external IDs."
    );
  }

  if (!plan?.serviceCode && !plan?.procedureCode) {
    applyPenalty(
      result,
      DEFAULT_RULES.missingServiceCode,
      "Missing service or procedure code."
    );
  }

  const manualEditEvents = events.filter((event) => event.type === "EDIT").length;
  if (manualEditEvents > thresholds.maxManualEdits) {
    applyPenalty(
      result,
      DEFAULT_RULES.excessiveManualEdits,
      "Excessive manual edits detected."
    );
  }

  result.riskBucket = getRiskBucket(result.score, thresholds);
  return result;
}

export async function computePredictiveComplianceScore(visitId, options = {}) {
  const [plan, actual, events] = await Promise.all([
    VisitPlan.findById(visitId).lean(),
    VisitActual.findOne({ visitId }).lean(),
    VisitEvent.find({ visitId }).sort({ timestampUtc: 1 }).lean(),
  ]);

  const evaluation = computePredictiveComplianceScoreFromData({
    plan,
    actual,
    events,
    config: options.config,
  });

  const agencyId = plan?.agencyId || actual?.agencyId || options.agencyId;
  if (!agencyId) {
    return evaluation;
  }

  const record = await ComplianceEvaluation.create({
    agencyId,
    visitId,
    predictiveScore: evaluation.score,
    riskBucket: evaluation.riskBucket,
    failedRules: evaluation.failedRules,
    calculatedAt: new Date(),
  });

  return { ...evaluation, record };
}

export function shouldEnqueueSubmission(score, threshold = 80) {
  return score >= threshold;
}
