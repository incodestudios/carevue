import mongoose from "mongoose";

const VisitActualSchema = new mongoose.Schema(
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
    actualStartUtc: { type: Date, index: true },
    actualEndUtc: { type: Date, index: true },
    captureMethod: {
      type: String,
      enum: ["GPS", "Telephony", "Manual"],
      default: "GPS",
      index: true,
    },
    manualEditFlag: { type: Boolean, default: false },
    editReasonCodes: [{ type: String, trim: true }],
    tasksPerformed: [{ type: String, trim: true }],
    tasksRefused: [{ type: String, trim: true }],
  },
  { timestamps: true }
);

VisitActualSchema.index({ agencyId: 1, visitId: 1 });

export default mongoose.model("VisitActual", VisitActualSchema);
