import { httpError } from "../../util.js";
import { requireId } from "../../middleware/validate.js";

export function parseCustomerId(value) {
  return requireId(value, "Customer not found");
}

export function parseExportQuery(query = {}) {
  const format = query.format === "xls" || query.format === "csv" ? query.format : "";
  if (query.format && !format) throw httpError(400, "Choose CSV or Excel");
  return {
    format,
    search: String(query.search || "").trim(),
  };
}
