import mongoose from "mongoose";

export const EVV_AUDIT_ENTITY_TYPES = ["OVERRIDE", "VISIT"];
export const EVV_AUDIT_ACTIONS = [
  "CREATED",
  "ASSIGNED",
  "NOTE_ADDED",
  "BILLABLE_SET",
  "APPROVED",
  "REJECTED",
  "NEEDS_INFO",
  "REVIEWED",
];

const EvvAuditEventSchema = new mongoose.Schema(
  {
    agencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agency",
      required: true,
      index: true,
    },
    entityType: { type: String, enum: EVV_AUDIT_ENTITY_TYPES, required: true },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    action: { type: String, enum: EVV_AUDIT_ACTIONS, required: true },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

EvvAuditEventSchema.index({ agencyId: 1, entityType: 1, entityId: 1, createdAt: -1 });
EvvAuditEventSchema.index({ agencyId: 1, entityType: 1, createdAt: -1 });

export default mongoose.model("EvvAuditEvent", EvvAuditEventSchema);
