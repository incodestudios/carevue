import VisitEvent from "../models/VisitEvent.js";
import { computePredictiveComplianceScore, shouldEnqueueSubmission } from "./complianceEngine.js";
import { enqueueVisitSubmission } from "../queues/evvSubmissionQueue.js";

export async function recordVisitEvent({
  agencyId,
  visitId,
  type,
  timestampUtc,
  source,
  geo,
  deviceId,
  phoneNumber,
  reasonCode,
}) {
  return VisitEvent.create({
    agencyId,
    visitId,
    type,
    timestampUtc,
    source,
    geo,
    deviceId,
    phoneNumber,
    reasonCode,
  });
}

export async function handleClockOut({
  agencyId,
  visitId,
  timestampUtc,
  source,
  geo,
  deviceId,
  phoneNumber,
}) {
  await recordVisitEvent({
    agencyId,
    visitId,
    type: "CLOCK_OUT",
    timestampUtc,
    source,
    geo,
    deviceId,
    phoneNumber,
  });

  const evaluation = await computePredictiveComplianceScore(visitId, { agencyId });
  if (shouldEnqueueSubmission(evaluation.score)) {
    await enqueueVisitSubmission({ visitId, adjudicator: "HHAX" });
  }

  return evaluation;
}
