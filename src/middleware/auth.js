import { can, findAdminById, isSuper } from "../features/admin/service.js";
import { readSession } from "../features/auth/session.js";

/** Require a valid staff (admin) session cookie. */
export async function requireStaff(req, res, next) {
  try {
    const session = await readSession(req.cookies?.admin_sid, "admin");
    const admin = session ? await findAdminById(Number(session.subject)) : null;
    if (!admin || !admin.active) {
      res.status(401).json({ success: false, message: "Staff sign-in required" });
      return;
    }
    req.admin = admin;
    req.adminSession = session;
    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
}

/** Super admin only (create/manage staff). */
export function requireSuper(req, res, next) {
  if (isSuper(req.admin)) {
    next();
    return;
  }
  res.status(403).json({ success: false, message: "Super admin only" });
}

/** Require any of the listed privileges (super always passes). */
export function requirePrivilege(...privileges) {
  return (req, res, next) => {
    if (privileges.some((key) => can(req.admin, key))) {
      next();
      return;
    }
    res.status(403).json({ success: false, message: "Not allowed for this account" });
  };
}
