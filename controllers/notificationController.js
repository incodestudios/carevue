import mongoose from "mongoose";
import Notification from "../models/Notification.js";

const ADMIN_ROLES = [
  "super_admin",
  "agency_super_admin",
  "agency_admin",
  "scheduler",
];

function isValidObjectId(id) {
  return !!id && mongoose.Types.ObjectId.isValid(id);
}

export async function listNotifications(req, res) {
  try {
    const { status, type, page = 1, limit = 50 } = req.query;

    const q = {
      agencyId: req.agencyId,
      recipientType: "user",
      recipientUserId: req.user.id,
      status: { $ne: "read" },
    };

    if (status) q.status = status;
    if (type) q.type = type;

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 50));
    const total = await Notification.countDocuments(q);

    const items = await Notification.find(q)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    res.json({ page: pageNum, limit: limitNum, total, items });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function listRoleNotifications(req, res) {
  try {
    const { status, type, page = 1, limit = 50 } = req.query;

    if (!ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const q = {
      agencyId: req.agencyId,
      recipientType: "role",
      toRole: ADMIN_ROLES.includes(req.user.role) ? "admin" : "agency_admin",
      status: { $ne: "read" },
    };
    
    if (status) q.status = status;
    if (type) q.type = type;

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 50));
    const total = await Notification.countDocuments(q);

    const items = await Notification.find(q)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    res.json({ page: pageNum, limit: limitNum, total, items });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function markNotificationRead(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const updated = await Notification.findOneAndUpdate(
      {
        _id: id,
        agencyId: req.agencyId,
        recipientType: "user",
        recipientUserId: req.user.id,
      },
      { $set: { status: "read", readAt: new Date() } },
      { new: true }
    ).lean();

    if (!updated) return res.status(404).json({ message: "Notification not found" });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}

export async function markRoleNotificationRead(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    if (!ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const updated = await Notification.findOneAndUpdate(
      {
        _id: id,
        agencyId: req.agencyId,
        recipientType: "role",
        toRole: "admin",
      },
      { $set: { status: "read", readAt: new Date() } },
      { new: true }
    ).lean();

    if (!updated) return res.status(404).json({ message: "Notification not found" });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
}
