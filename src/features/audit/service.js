export async function writeAudit(tx, adminId, action, detail) {
  await tx.run(
    "INSERT INTO audit_log (admin_id, action, detail) VALUES (?, ?, ?)",
    [adminId, action, JSON.stringify(detail)],
  );
}
