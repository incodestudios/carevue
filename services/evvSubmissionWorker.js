import VisitPlan from "../models/VisitPlan.js";
import {
  ensureIdempotentSubmission,
  mapHhaxErrors,
  updateSubmissionStatus,
} from "./adjudicationService.js";
import { submitCaregiver, submitVisit, pollTransactionStatus } from "./hhaxClient.js";
import { buildHhaxCaregiverPayload, buildHhaxVisitPayload } from "./hhaxPayloadBuilder.js";

function normalizeAdjudicationStatus(payload) {
  const raw = payload?.status || payload?.result || "";
  const normalized = String(raw).toUpperCase();
  if (normalized.includes("ACCEPT")) return "ACCEPTED";
  if (normalized.includes("REJECT")) return "REJECTED";
  return "PENDING";
}

export async function processSubmissionJob(job) {
  const { visitId, adjudicator = "HHAX" } = job.data || {};
  if (!visitId) {
    throw new Error("visitId is required for submission job.");
  }
  if (adjudicator !== "HHAX") {
    throw new Error(`Unsupported adjudicator: ${adjudicator}`);
  }

  const plan = await VisitPlan.findById(visitId).lean();
  if (!plan) {
    throw new Error(`VisitPlan not found: ${visitId}`);
  }

  const visitPayload = await buildHhaxVisitPayload(visitId);
  const submission = await ensureIdempotentSubmission({
    agencyId: plan.agencyId,
    visitId,
    adjudicator,
    payloadVersion: "v1",
    requestPayload: visitPayload,
  });

  if (submission.status && submission.status !== "PENDING") {
    return submission;
  }

  const caregiverPayload = await buildHhaxCaregiverPayload(visitId);
  await submitCaregiver(caregiverPayload);

  const submitResponse = await submitVisit(visitPayload);
  const transactionId = submitResponse?.transactionId || submitResponse?.transaction_id;
  const evvmsid = submitResponse?.evvmsid;

  const pending = await updateSubmissionStatus({
    submissionId: submission._id || submission.id,
    status: "PENDING",
    responsePayload: submitResponse,
    transactionId,
    evvmsid,
  });

  if (!transactionId) {
    return pending;
  }

  const pollResponse = await pollTransactionStatus(transactionId);
  const finalStatus = normalizeAdjudicationStatus(pollResponse);
  const errors = finalStatus === "REJECTED" ? mapHhaxErrors(pollResponse) : [];

  return updateSubmissionStatus({
    submissionId: submission._id || submission.id,
    status: finalStatus,
    responsePayload: pollResponse,
    errors,
    transactionId,
    evvmsid: pollResponse?.evvmsid || evvmsid,
    externalVisitId: pollResponse?.externalVisitId,
  });
}
