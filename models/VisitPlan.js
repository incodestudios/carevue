import mongoose from "mongoose";

const VisitPlanSchema = new mongoose.Schema(
  {
    agencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agency",
      required: true,
      index: true,
    },
    scheduledStartUtc: { type: Date, required: true, index: true },
    scheduledEndUtc: { type: Date, required: true, index: true },
    caregiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },
    payerProgram: { type: String, trim: true, index: true },
    serviceCode: { type: String, trim: true, index: true },
    procedureCode: { type: String, trim: true, index: true },
    expectedServiceLocation: {
      lat: { type: Number },
      lng: { type: Number },
      address: { type: String, trim: true },
    },
    externalIds: {
      caregiver: { type: String, trim: true },
      patient: { type: String, trim: true },
      visit: { type: String, trim: true },
    },
  },
  { timestamps: true }
);

VisitPlanSchema.index({ agencyId: 1, caregiverId: 1, scheduledStartUtc: 1 });
VisitPlanSchema.index({ agencyId: 1, patientId: 1, scheduledStartUtc: 1 });

export default mongoose.model("VisitPlan", VisitPlanSchema);
