import { Router } from "express";
import auth from "../middlewares/auth.js";
import agencyScope from "../middlewares/agencyScope.js";
import requireRole from "../middlewares/requireRole.js";
import {
  getException,
  getExceptionAudit,
  getSummary,
  listExceptions,
  listExplanationResponses,
  createManualException,
  deleteException,
  markNotificationRead,
  updateReviewed,
  requestExplanation,
  addCoordinatorNote,
  setBillingStatus,
  assignOwner,
  resolveException,
} from "../controllers/evvController.js";
import {
  addOverrideAttachment,
  addOverrideNote,
  approveOverride,
  assignOverrideOwner,
  createOverride,
  getOverride,
  getOverrideSummary,
  listOverrides,
  markOverrideReviewed,
  rejectOverride,
  requestOverrideExplanation,
  setOverrideBillable,
} from "../controllers/evvOverrideController.js";

const router = Router();

const ADMIN_ROLES = [
  "super_admin",
  "agency_super_admin",
  "agency_admin",
  "scheduler",
];

const ALL_ROLES = [
  "super_admin",
  "agency_super_admin",
  "agency_admin",
  "scheduler",
  "caregiver",
];

const OVERRIDE_COORDINATOR_ROLES = [
  "super_admin",
  "agency_super_admin",
  "agency_admin",
  "scheduler",
];

const OVERRIDE_APPROVER_ROLES = [
  "super_admin",
  "agency_super_admin",
  "agency_admin",
];

// GET /api/evv/exceptions
router.get("/exceptions", auth, agencyScope, requireRole(...ADMIN_ROLES), listExceptions);

// POST /api/evv/exceptions/manual
router.post(
  "/exceptions/manual",
  auth,
  agencyScope,
  requireRole(...ALL_ROLES),
  createManualException
);

// GET /api/evv/exceptions/:id
router.get("/exceptions/:id", auth, agencyScope, requireRole(...ADMIN_ROLES), getException);

// GET /api/evv/exceptions/:id/audit
router.get(
  "/exceptions/:id/audit",
  auth,
  agencyScope,
  requireRole(...ADMIN_ROLES),
  getExceptionAudit
);

// GET /api/evv/explanations/responses
router.get(
  "/explanations/responses",
  auth,
  agencyScope,
  requireRole(...ADMIN_ROLES),
  listExplanationResponses
);
// DELETE /api/evv/exceptions/:id
router.delete("/exceptions/:id", auth, agencyScope, requireRole(...ADMIN_ROLES), deleteException);

// PATCH /api/evv/exceptions/:id/reviewed
router.patch(
  "/exceptions/:id/reviewed",
  auth,
  agencyScope,
  requireRole(...ADMIN_ROLES),
  updateReviewed
);

// POST /api/evv/exceptions/:id/explanation-request
router.post(
  "/exceptions/:id/explanation-request",
  auth,
  agencyScope,
  requireRole(...ADMIN_ROLES),
  requestExplanation
);

// POST /api/evv/exceptions/:id/notes
router.post(
  "/exceptions/:id/notes",
  auth,
  agencyScope,
  requireRole(...ADMIN_ROLES),
  addCoordinatorNote
);

// PATCH /api/evv/exceptions/:id/billing-status
router.patch(
  "/exceptions/:id/billing-status",
  auth,
  agencyScope,
  requireRole(...ADMIN_ROLES),
  setBillingStatus
);

// PATCH /api/evv/exceptions/:id/owner
router.patch(
  "/exceptions/:id/owner",
  auth,
  agencyScope,
  requireRole(...ADMIN_ROLES),
  assignOwner
);

// POST /api/evv/exceptions/:id/resolve
router.post(
  "/exceptions/:id/resolve",
  auth,
  agencyScope,
  requireRole(...ADMIN_ROLES),
  resolveException
);

// GET /api/evv/summary
router.get("/summary", auth, agencyScope, requireRole(...ADMIN_ROLES), getSummary);

// PATCH /api/evv/notifications/:id/read
router.patch(
  "/notifications/:id/read",
  auth,
  agencyScope,
  requireRole(...ADMIN_ROLES),
  markNotificationRead
);

// GET /api/evv/overrides
router.get("/overrides", auth, agencyScope, requireRole(...ALL_ROLES), listOverrides);

// GET /api/evv/overrides/:id
router.get("/overrides/:id", auth, agencyScope, requireRole(...ALL_ROLES), getOverride);

// POST /api/evv/overrides
router.post(
  "/overrides",
  auth,
  agencyScope,
  requireRole(...OVERRIDE_COORDINATOR_ROLES),
  createOverride
);

// PATCH /api/evv/overrides/:id/assign-owner
router.patch(
  "/overrides/:id/assign-owner",
  auth,
  agencyScope,
  requireRole(...OVERRIDE_COORDINATOR_ROLES),
  assignOverrideOwner
);

// POST /api/evv/overrides/:id/request-explanation
router.post(
  "/overrides/:id/request-explanation",
  auth,
  agencyScope,
  requireRole(...OVERRIDE_COORDINATOR_ROLES),
  requestOverrideExplanation
);

// POST /api/evv/overrides/:id/notes
router.post("/overrides/:id/notes", auth, agencyScope, requireRole(...ALL_ROLES), addOverrideNote);

// PATCH /api/evv/overrides/:id/billable
router.patch(
  "/overrides/:id/billable",
  auth,
  agencyScope,
  requireRole(...OVERRIDE_COORDINATOR_ROLES),
  setOverrideBillable
);

// PATCH /api/evv/overrides/:id/approve
router.patch(
  "/overrides/:id/approve",
  auth,
  agencyScope,
  requireRole(...OVERRIDE_APPROVER_ROLES),
  approveOverride
);

// PATCH /api/evv/overrides/:id/reject
router.patch(
  "/overrides/:id/reject",
  auth,
  agencyScope,
  requireRole(...OVERRIDE_APPROVER_ROLES),
  rejectOverride
);

// PATCH /api/evv/overrides/:id/mark-reviewed
router.patch(
  "/overrides/:id/mark-reviewed",
  auth,
  agencyScope,
  requireRole(...OVERRIDE_APPROVER_ROLES),
  markOverrideReviewed
);

// POST /api/evv/overrides/:id/attachments
router.post(
  "/overrides/:id/attachments",
  auth,
  agencyScope,
  requireRole(...OVERRIDE_COORDINATOR_ROLES),
  addOverrideAttachment
);

// GET /api/evv/overrides/reports/summary
router.get(
  "/overrides/reports/summary",
  auth,
  agencyScope,
  requireRole(...OVERRIDE_COORDINATOR_ROLES),
  getOverrideSummary
);

export default router;
