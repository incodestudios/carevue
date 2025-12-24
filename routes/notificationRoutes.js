import { Router } from "express";
import auth from "../middlewares/auth.js";
import agencyScope from "../middlewares/agencyScope.js";
import requireRole from "../middlewares/requireRole.js";
import {
  listNotifications,
  listRoleNotifications,
  markNotificationRead,
} from "../controllers/notificationController.js";

const router = Router();

const ALL_ROLES = [
  "super_admin",
  "agency_super_admin",
  "agency_admin",
  "scheduler",
  "caregiver",
];

const ADMIN_ROLES = [
  "super_admin",
  "agency_super_admin",
  "agency_admin",
  "scheduler",
];

// GET /api/notifications
router.get("/", auth, agencyScope, requireRole(...ALL_ROLES), listNotifications);

// GET /api/notifications/role
router.get("/role", auth, agencyScope, requireRole(...ADMIN_ROLES), listRoleNotifications);

// PATCH /api/notifications/:id/read
router.patch("/:id/read", auth, agencyScope, requireRole(...ALL_ROLES), markNotificationRead);

export default router;
