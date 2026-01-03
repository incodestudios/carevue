import VisitPlan from "../models/VisitPlan.js";
import VisitActual from "../models/VisitActual.js";
import VisitEvent from "../models/VisitEvent.js";

export async function buildHhaxVisitPayload(visitId) {
  const [plan, actual, events] = await Promise.all([
    VisitPlan.findById(visitId).lean(),
    VisitActual.findOne({ visitId }).lean(),
    VisitEvent.find({ visitId }).sort({ timestampUtc: 1 }).lean(),
  ]);

  return {
    visitId,
    scheduledStartUtc: plan?.scheduledStartUtc,
    scheduledEndUtc: plan?.scheduledEndUtc,
    caregiverId: plan?.caregiverId,
    patientId: plan?.patientId,
    payerProgram: plan?.payerProgram,
    serviceCode: plan?.serviceCode || plan?.procedureCode,
    actualStartUtc: actual?.actualStartUtc,
    actualEndUtc: actual?.actualEndUtc,
    captureMethod: actual?.captureMethod,
    events: events?.map((event) => ({
      type: event.type,
      timestampUtc: event.timestampUtc,
      source: event.source,
      geo: event.geo,
      deviceId: event.deviceId,
      phoneNumber: event.phoneNumber,
      reasonCode: event.reasonCode,
    })),
  };
}

export async function buildHhaxCaregiverPayload(visitId) {
  const plan = await VisitPlan.findById(visitId).lean();
  return {
    caregiverId: plan?.caregiverId,
    externalId: plan?.externalIds?.caregiver,
  };
}
