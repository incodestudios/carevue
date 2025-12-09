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
    title: { type: String, trim: true },
    location: { type: String, trim: true },
  serviceType: { type: String, trim: true, index: true },
  startTime: { type: Date, required: true, index: true },
  endTime: { type: Date, required: true, index: true },
  clockInTime: { type: Date, index: true },
  clockOutTime: { type: Date, index: true },
  status: {
    type: String,
    enum: ["scheduled", "in_progress", "completed", "canceled", "no_show"],
    default: "scheduled",
    index: true,
  },
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// indexes for efficient queries
VisitSchema.index({ agencyId: 1, caregiverId: 1, startTime: 1 });
VisitSchema.index({ agencyId: 1, patientId: 1, startTime: 1 });

export default mongoose.model("Visit", VisitSchema);
