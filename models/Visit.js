import mongoose from "mongoose";

const VisitSchema = new mongoose.Schema(
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
      ref: "User",
      required: true,
      index: true,
    },
    date: { type: String, trim: true, index: true },
    title: { type: String, trim: true },
    location: { type: String, trim: true },
    serviceType: { type: String, trim: true, index: true },
    startTime: { type: Date, required: true, index: true },
    endTime: { type: Date, required: true, index: true },
    scheduledStartAt: { type: Date, index: true },
    scheduledEndAt: { type: Date, index: true },
    clockInTime: { type: Date, index: true, default: null },
    clockOutTime: { type: Date, index: true, default: null },
    clockInAt: { type: Date, index: true, default: null },
    clockOutAt: { type: Date, index: true, default: null },
    clockInLocation: { type: mongoose.Schema.Types.Mixed, default: null },
    clockOutLocation: { type: mongoose.Schema.Types.Mixed, default: null },
    clockInDistanceM: { type: Number, default: null },
    clockOutDistanceM: { type: Number, default: null },
    billingRateCents: { type: Number, default: null },
    payRatePerHour: { type: Number, default: null },
    signatureDataUrl: { type: String, default: null }, // base64 data URL from canvas
    status: {
      type: String,
      enum: ["scheduled", "in_progress", "completed", "canceled", "no_show"],
      default: "scheduled",
      index: true,
    },
    evvStatus: {
      type: String,
      enum: ["compliant", "exception", "resolved"],
      default: "compliant",
      index: true,
    },
    evvExceptions: [
      {
        type: { type: String },
        severity: { type: String },
        message: { type: String },
        occurredAt: { type: Date },
        meta: { type: mongoose.Schema.Types.Mixed },
      },
    ],
    notes: { type: String, trim: true },
    geofenceNotesClockIn: { type: String, trim: true },
    geofenceNotesClockOut: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// indexes for efficient queries
VisitSchema.index({ agencyId: 1, caregiverId: 1, startTime: 1 });
VisitSchema.index({ agencyId: 1, patientId: 1, startTime: 1 });

export default mongoose.model("Visit", VisitSchema);
