import Notification from "../models/Notification.js";

export async function createUserNotification({
  agencyId,
  recipientUserId,
  type,
  title,
  body,
  payload,
  senderUserId,
  visitId,
  exceptionId,
}) {
  if (!agencyId || !recipientUserId || !type || !title || !body) return null;
  return Notification.create({
    agencyId,
    recipientType: "user",
    recipientUserId,
    type,
    title,
    body,
    payload,
    senderUserId,
    visitId,
    exceptionId,
  });
}

export async function createRoleNotification({
  agencyId,
  toRole,
  type,
  title,
  body,
  payload,
  senderUserId,
  visitId,
  exceptionId,
}) {
  if (!agencyId || !toRole || !type || !title || !body) return null;
  return Notification.create({
    agencyId,
    recipientType: "role",
    toRole,
    type,
    title,
    body,
    payload,
    senderUserId,
    visitId,
    exceptionId,
  });
}
