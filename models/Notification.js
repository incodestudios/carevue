import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema(
  {
    agencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agency",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "EVV_EXCEPTION",
        "EVV_EXPLANATION_REQUESTED",
        "EVV_EXPLANATION_RESPONSE",
        "SCHEDULE_ASSIGNED",
        "SCHEDULE_UPDATED",
      ],
      required: true,
      index: true,
    },
    recipientType: {
      type: String,
      enum: ["role", "user"],
      default: "role",
      index: true,
    },
    toRole: {
      type: String,
      enum: ["admin", "scheduler"],
      required: function requiredRole() {
        return this.recipientType === "role";
      },
      index: true,
    },
    recipientUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function requiredUser() {
        return this.recipientType === "user";
      },
      index: true,
    },
    visitId: { type: mongoose.Schema.Types.ObjectId, ref: "Visit", index: true },
    exceptionId: { type: mongoose.Schema.Types.ObjectId, ref: "EVVException", index: true },
    title: { type: String, trim: true, required: true },
    body: { type: String, trim: true, required: true },
    payload: { type: mongoose.Schema.Types.Mixed },
    senderUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    status: {
      type: String,
      enum: ["unread", "read", "archived"],
      default: "unread",
      index: true,
    },
    readAt: { type: Date, default: null, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

NotificationSchema.index({ agencyId: 1, createdAt: -1 });
NotificationSchema.index({ agencyId: 1, toRole: 1, readAt: 1 });
NotificationSchema.index({ agencyId: 1, recipientUserId: 1, status: 1, createdAt: -1 });

export default mongoose.model("Notification", NotificationSchema);
