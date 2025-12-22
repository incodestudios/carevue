import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema(
  {
    agencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agency",
      required: true,
      index: true,
    },
    type: { type: String, enum: ["EVV_EXCEPTION"], required: true, index: true },
    toRole: {
      type: String,
      enum: ["admin", "scheduler"],
      required: true,
      index: true,
    },
    visitId: { type: mongoose.Schema.Types.ObjectId, ref: "Visit", index: true },
    exceptionId: { type: mongoose.Schema.Types.ObjectId, ref: "EVVException", index: true },
    title: { type: String, trim: true, required: true },
    body: { type: String, trim: true, required: true },
    readAt: { type: Date, default: null, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

NotificationSchema.index({ agencyId: 1, createdAt: -1 });
NotificationSchema.index({ agencyId: 1, toRole: 1, readAt: 1 });

export default mongoose.model("Notification", NotificationSchema);
