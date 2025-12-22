import mongoose from "mongoose";

const EVVExceptionAuditSchema = new mongoose.Schema(
  {
    agencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agency",
      required: true,
      index: true,
    },
    entityType: {
      type: String,
      enum: ["evv_exception"],
      required: true,
      index: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EVVException",
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: [
        "MARK_REVIEWED",
        "REQUEST_EXPLANATION",
        "ADD_NOTE",
        "SET_BILLING_STATUS",
        "ASSIGN_OWNER",
        "RESPOND_EXPLANATION",
      ],
      required: true,
      index: true,
    },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    actorRole: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

EVVExceptionAuditSchema.index({ agencyId: 1, entityId: 1, createdAt: -1 });
EVVExceptionAuditSchema.index({ agencyId: 1, entityType: 1, createdAt: -1 });

export default mongoose.model("EVVExceptionAudit", EVVExceptionAuditSchema);
