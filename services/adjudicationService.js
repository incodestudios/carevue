import crypto from "crypto";
import AdjudicationSubmission from "../models/AdjudicationSubmission.js";

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(",")}}`;
}

export function hashPayload(payload) {
  const serialized = stableStringify(payload);
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

export async function ensureIdempotentSubmission({
  store = AdjudicationSubmission,
  agencyId,
  visitId,
  adjudicator,
  payloadVersion,
  requestPayload,
}) {
  const payloadHash = hashPayload(requestPayload);

  const existingQuery = await store.findOne({ visitId, adjudicator, payloadHash });
  const existing = existingQuery?.lean ? await existingQuery.lean() : existingQuery;
  if (existing) return existing;

  const submission = await store.create({
    agencyId,
    visitId,
    adjudicator,
    payloadVersion,
    requestPayload,
    payloadHash,
    status: "PENDING",
    submittedAt: new Date(),
  });

  return submission.toObject?.() || submission;
}

export async function updateSubmissionStatus({
  store = AdjudicationSubmission,
  submissionId,
  status,
  responsePayload,
  errors,
  transactionId,
  evvmsid,
  externalVisitId,
}) {
  const update = {
    status,
    responsePayload,
    errors,
    transactionId,
    evvmsid,
    externalVisitId,
    respondedAt: new Date(),
  };

  return store.findByIdAndUpdate(submissionId, { $set: update }, { new: true }).lean();
}

export function mapHhaxErrors(payload) {
  const rawErrors = payload?.errors || payload?.validationErrors || [];
  return rawErrors.map((error) => ({
    code: error.code || error.errorCode || "UNKNOWN",
    message: error.message || error.errorMessage || "Unknown error",
    fieldPath: error.fieldPath || error.field || null,
    severity: error.severity || "ERROR",
  }));
}
