import { Router } from "express";
import { requirePrivilege, requireStaff } from "../../middleware/auth.js";
import { wrap } from "../../middleware/error-handler.js";
import * as controller from "./controller.js";

const router = Router();
const customers = [requireStaff, requirePrivilege("customers")];

router.get("/admin-customers", ...customers, wrap(controller.list));
router.get("/admin-customer", ...customers, wrap(controller.history));

export default router;
