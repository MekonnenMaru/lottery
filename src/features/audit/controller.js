import { clearEvents, listEvents } from "./service.js";
import { intValue } from "../../util.js";

export async function list(req, res) {
  const result = await listEvents({
    search: String(req.query.search || ""),
    action: String(req.query.action || "all"),
    page: intValue(req.query.page, 1, 100_000) || 1,
    pageSize: intValue(req.query.page_size, 1, 100) || 25,
  });
  res.json({ success: true, ...result });
}

export async function clear(req, res) {
  const result = await clearEvents(req.admin.id);
  res.json({ success: true, ...result });
}
