import mongoose from "mongoose";

const AdjudicationSubmissionSchema = new mongoose.Schema(
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
    adjudicator: {
      type: String,
      enum: ["HHAX", "SANDATA"],
      required: true,
      index: true,
    },
    payloadVersion: { type: String, trim: true, required: true },
    requestPayload: { type: mongoose.Schema.Types.Mixed, required: true },
    responsePayload: { type: mongoose.Schema.Types.Mixed },
    payloadHash: { type: String, trim: true, required: true, index: true },
    transactionId: { type: String, trim: true, index: true },
    externalVisitId: { type: String, trim: true, index: true },
    evvmsid: { type: String, trim: true, index: true },
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "REJECTED"],
      default: "PENDING",
      index: true,
    },
    errors: [
      {
        code: { type: String, trim: true },
        message: { type: String, trim: true },
        fieldPath: { type: String, trim: true },
        severity: { type: String, trim: true },
      },
    ],
    submittedAt: { type: Date, required: true, index: true },
    respondedAt: { type: Date, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AdjudicationSubmissionSchema.index(
  { adjudicator: 1, visitId: 1, payloadHash: 1 },
  { unique: true }
);

export default mongoose.model("AdjudicationSubmission", AdjudicationSubmissionSchema);
