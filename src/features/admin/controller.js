import { logEvent } from "../audit/service.js";
import { PRIVILEGES, createStaff, listStaff, updateStaff } from "./service.js";

export async function options(req, res) {
  res.json({ success: true, privileges: PRIVILEGES });
}

export async function list(req, res) {
  res.json({ success: true, data: await listStaff(), privileges: PRIVILEGES });
}

export async function create(req, res) {
  const admin = await createStaff({
    name: req.body?.name,
    username: req.body?.username,
    phone: req.body?.phone,
    password: req.body?.password,
    privileges: req.body?.privileges,
  });
  await logEvent(req.admin.id, "create_admin", {
    adminId: admin.id,
    username: admin.username,
    name: admin.name,
  });
  res.json({ success: true, admin });
}

export async function update(req, res) {
  const admin = await updateStaff(req.admin.id, {
    id: req.body?.id,
    name: req.body?.name,
    phone: req.body?.phone,
    privileges: req.body?.privileges,
    active: req.body?.active,
    password: req.body?.password,
  });
  await logEvent(req.admin.id, "update_admin", {
    adminId: admin?.id,
    username: admin?.username,
    active: admin?.active,
  });
  res.json({ success: true, admin });
}
