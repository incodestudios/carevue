// models/PatientCaregiver.js
import mongoose from "mongoose";

const PatientCaregiverSchema = new mongoose.Schema(
  {
    agencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agency",
      required: true,
      index: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },
    caregiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // caregiver user
      required: true,
      index: true,
    },
    isPrimary: {
      type: Boolean,
      default: false,
    },
    isSecondary: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

// Important compound indexes for large datasets
PatientCaregiverSchema.index({ agencyId: 1, patientId: 1 });
PatientCaregiverSchema.index({ agencyId: 1, caregiverId: 1 });
PatientCaregiverSchema.index(
  { patientId: 1, isPrimary: 1 },
  { partialFilterExpression: { isPrimary: true } }
);

// Optional index to speed up queries for secondary caregivers if needed
PatientCaregiverSchema.index(
  { patientId: 1, isSecondary: 1 },
  { partialFilterExpression: { isSecondary: true } }
);

export default mongoose.model("PatientCaregiver", PatientCaregiverSchema);