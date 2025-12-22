import mongoose from "mongoose";

export const OVERRIDE_EXCEPTION_TYPES = [
  "MISSED_VISIT",
  "LATE_CLOCK_IN",
  "OUTSIDE_GEOFENCE_CLOCK_IN",
  "OUTSIDE_GEOFENCE_CLOCK_OUT",
  "MISSING_CLOCK_OUT",
];

export const OVERRIDE_SEVERITIES = ["low", "medium", "high"];

export const OVERRIDE_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "NEEDS_INFO",
  "REVIEWED",
];

export const OVERRIDE_BILLABLE_DECISIONS = ["BILLABLE", "NOT_BILLABLE", "UNDECIDED"];

export const OVERRIDE_REASON_CODES = [
  "CLIENT_REQUEST",
  "CAREGIVER_FORGOT",
  "TECHNICAL_ISSUE",
  "DOCUMENTATION_ERROR",
  "SCHEDULE_CHANGE",
  "OTHER",
];

const RequestedChangeSchema = new mongoose.Schema(
  {
    field: { type: String, required: true, trim: true },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const AttachmentSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    filename: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    uploadedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const EvvOverrideSchema = new mongoose.Schema(
  {
    agencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agency",
      required: true,
      index: true,
    },
    visitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Visit",
      required: true,
      index: true,
    },
    clientId: {
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
    exceptionType: {
      type: String,
      enum: OVERRIDE_EXCEPTION_TYPES,
      required: true,
      index: true,
    },
    severity: { type: String, enum: OVERRIDE_SEVERITIES, default: "medium" },
    status: { type: String, enum: OVERRIDE_STATUSES, default: "PENDING", index: true },
    requestedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    assignedOwnerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    requestedChange: { type: RequestedChangeSchema, required: true },
    reasonCode: { type: String, enum: OVERRIDE_REASON_CODES, required: true },
    reasonText: { type: String, trim: true },
    billableDecision: {
      type: String,
      enum: OVERRIDE_BILLABLE_DECISIONS,
      default: "UNDECIDED",
      index: true,
    },
    coordinatorNotesCount: { type: Number, default: 0 },
    attachments: { type: [AttachmentSchema], default: [] },
  },
  { timestamps: true }
);

EvvOverrideSchema.index({ agencyId: 1, status: 1, createdAt: -1 });
EvvOverrideSchema.index({ agencyId: 1, caregiverId: 1, createdAt: -1 });

export default mongoose.model("EvvOverride", EvvOverrideSchema);
