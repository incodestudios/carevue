import mongoose from "mongoose";

const AuditSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    byUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    action: { type: String, required: true },
    changes: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const ResolutionSchema = new mongoose.Schema(
  {
    resolvedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    resolvedAt: { type: Date },
    action: { type: String, enum: ["OVERRIDE", "DISMISS", "FIXED"] },
    reasonCode: { type: String, trim: true },
    note: { type: String, trim: true },
  },
  { _id: false }
);

const ExplanationResponseSchema = new mongoose.Schema(
  {
    text: { type: String, trim: true },
    respondedAt: { type: Date },
  },
  { _id: false }
);

const ExplanationRequestSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["none", "requested", "received", "overdue"],
      default: "none",
    },
    requestedAt: { type: Date },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    caregiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    message: { type: String, trim: true },
    dueAt: { type: Date },
    response: ExplanationResponseSchema,
  },
  { _id: false }
);

const CoordinatorNoteSchema = new mongoose.Schema(
  {
    text: { type: String, trim: true },
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { _id: true }
);

const EVVExceptionSchema = new mongoose.Schema(
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
    caregiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "LATE_CLOCK_IN",
        "OUTSIDE_GEOFENCE_CLOCK_IN",
        "OUTSIDE_GEOFENCE_CLOCK_OUT",
        "MISSING_CLOCK_OUT",
        "MISSED_VISIT",
        "MANUAL_OVERRIDE",
      ],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["OPEN", "RESOLVED", "DISMISSED"],
      default: "OPEN",
      index: true,
    },
    severity: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH"],
      default: "MEDIUM",
      index: true,
    },
    severityRank: { type: Number, default: 1, index: true },
    message: { type: String, trim: true },
    occurredAt: { type: Date, required: true, index: true },
    detectedAt: { type: Date, default: Date.now },
    meta: { type: mongoose.Schema.Types.Mixed },
    resolution: ResolutionSchema,
    reviewed: { type: Boolean, default: false },
    reviewedAt: { type: Date },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    billingStatus: {
      type: String,
      enum: ["billable", "non_billable", "needs_review"],
      default: "needs_review",
    },
    billingReason: { type: String, trim: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    ownerAssignedAt: { type: Date },
    ownerAssignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    explanationRequest: { type: ExplanationRequestSchema, default: () => ({}) },
    coordinatorNotes: { type: [CoordinatorNoteSchema], default: [] },
    audit: [AuditSchema],
  },
  { timestamps: true }
);

EVVExceptionSchema.index({ agencyId: 1, occurredAt: -1 });
EVVExceptionSchema.index({ agencyId: 1, status: 1 });
EVVExceptionSchema.index({ agencyId: 1, type: 1 });
EVVExceptionSchema.index({ agencyId: 1, caregiverId: 1 });
EVVExceptionSchema.index({ agencyId: 1, visitId: 1 });
EVVExceptionSchema.index(
  { agencyId: 1, visitId: 1, type: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "OPEN" } }
);

export default mongoose.model("EVVException", EVVExceptionSchema);
