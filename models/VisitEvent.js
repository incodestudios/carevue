import mongoose from "mongoose";

const VisitEventSchema = new mongoose.Schema(
  {
    agencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agency",
      required: true,
      index: true,
    },
    visitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VisitPlan",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["CLOCK_IN", "CLOCK_OUT", "EDIT", "CANCEL", "SIGNATURE"],
      required: true,
      index: true,
    },
    timestampUtc: { type: Date, required: true, index: true },
    source: {
      type: String,
      enum: ["caregiver", "admin", "system"],
      required: true,
      index: true,
    },
    geo: {
      lat: { type: Number },
      lng: { type: Number },
      accuracy: { type: Number },
    },
    deviceId: { type: String, trim: true },
    phoneNumber: { type: String, trim: true },
    reasonCode: { type: String, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

VisitEventSchema.index({ agencyId: 1, visitId: 1, timestampUtc: 1 });
VisitEventSchema.index({ agencyId: 1, type: 1, timestampUtc: 1 });

export default mongoose.model("VisitEvent", VisitEventSchema);
