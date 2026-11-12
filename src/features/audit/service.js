import { all, countOf, get, run } from "../../db.js";

/** Human labels for known audit actions. */
export const ACTION_LABELS = {
  login: "Signed in",
  logout: "Signed out",
  change_password: "Changed password",
  approve_payment: "Approved payment",
  reject_payment: "Rejected payment",
  scan_receipt: "Scanned receipt",
  clear_receipt_ocr: "Cleared receipt OCR",
  set_transaction_id: "Set transaction ID",
  set_payment_transfer: "Set payment bank/sender",
  announce_winner: "Announced winner",
  create_admin: "Created admin",
  update_admin: "Updated admin",
  update_settings: "Updated settings",
  create_bank: "Created bank account",
  update_bank: "Updated bank account",
  create_lottery: "Created lottery",
  update_lottery: "Updated lottery",
  delete_lottery: "Deleted lottery",
  hide_lottery: "Hid lottery",
  feature_lottery: "Featured lottery",
  clear_event_logs: "Cleared event logs",
};

export async function writeAudit(tx, adminId, action, detail) {
  const detailJson = detail == null ? null : JSON.stringify(detail);
  const params = [adminId ?? null, String(action || "").slice(0, 40), detailJson];
  if (tx?.run) {
    await tx.run("INSERT INTO audit_log (admin_id, action, detail) VALUES (?, ?, ?)", params);
    return;
  }
  await run("INSERT INTO audit_log (admin_id, action, detail) VALUES (?, ?, ?)", params);
}

export async function logEvent(adminId, action, detail) {
  await writeAudit(null, adminId, action, detail);
}

function parseDetail(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return { note: String(raw) };
  }
}

function detailSummary(detail) {
  if (!detail || typeof detail !== "object") return "";
  const parts = [];
  for (const [key, value] of Object.entries(detail)) {
    if (value == null || value === "") continue;
    if (typeof value === "object") continue;
    parts.push(`${key}: ${value}`);
  }
  return parts.join(" · ");
}

export async function listEvents({ search = "", action = "all", page = 1, pageSize = 25 } = {}) {
  const where = [];
  const params = [];
  if (action && action !== "all") {
    where.push("a.action = ?");
    params.push(action);
  }
  const q = String(search || "").trim();
  if (q) {
    where.push("(a.action LIKE ? OR a.detail LIKE ? OR adm.name LIKE ? OR adm.username LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const size = Math.min(Math.max(Number(pageSize) || 25, 1), 100);
  const pageNum = Math.max(Number(page) || 1, 1);
  const offset = (pageNum - 1) * size;

  const totalRow = await get(
    `SELECT COUNT(*) AS count
     FROM audit_log a
     LEFT JOIN admins adm ON adm.id = a.admin_id
     ${clause}`,
    params,
  );
  const total = countOf(totalRow);
  const rows = await all(
    `SELECT a.id, a.admin_id, a.action, a.detail, a.created_at,
            adm.name AS admin_name, adm.username AS admin_username
     FROM audit_log a
     LEFT JOIN admins adm ON adm.id = a.admin_id
     ${clause}
     ORDER BY a.id DESC
     LIMIT ? OFFSET ?`,
    [...params, size, offset],
  );

  const actions = await all(
    "SELECT DISTINCT action FROM audit_log ORDER BY action ASC",
  );

  return {
    data: rows.map((row) => {
      const detail = parseDetail(row.detail);
      return {
        id: row.id,
        action: row.action,
        action_label: ACTION_LABELS[row.action] || row.action,
        detail,
        detail_text: detailSummary(detail) || "—",
        admin_id: row.admin_id == null ? null : Number(row.admin_id),
        admin_name: row.admin_name || row.admin_username || "System",
        admin_username: row.admin_username || "",
        created_at: row.created_at,
      };
    }),
    total,
    page: pageNum,
    page_size: size,
    actions: actions.map((row) => ({
      id: row.action,
      label: ACTION_LABELS[row.action] || row.action,
    })),
  };
}

export async function clearEvents(adminId) {
  const before = countOf(await get("SELECT COUNT(*) AS count FROM audit_log"));
  await run("DELETE FROM audit_log");
  await logEvent(adminId, "clear_event_logs", { cleared: before });
  return { cleared: before };
}
