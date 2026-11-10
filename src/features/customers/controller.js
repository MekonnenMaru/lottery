import * as customers from "./service.js";
import { parseCustomerId, parseExportQuery } from "./validation.js";

export async function list(req, res) {
  const query = parseExportQuery(req.query);
  if (query.format) {
    const file = await customers.exportCustomers({ ...req.query, format: query.format, search: query.search });
    res.set("Content-Type", file.type);
    res.set("Content-Disposition", `attachment; filename="${file.name}"`);
    res.set("Cache-Control", "no-store");
    res.send(file.body);
    return;
  }
  res.json({ success: true, data: await customers.listCustomers() });
}

export async function history(req, res) {
  const id = parseCustomerId(req.query.id);
  res.json({ success: true, ...(await customers.customerHistory(id)) });
}
