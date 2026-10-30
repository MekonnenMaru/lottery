import { all, countOf, flag, get, run } from "../../db.js";
import { httpError, requiredText } from "../../util.js";

export async function seedBanks() {
  const banks = countOf(await get("SELECT COUNT(*) AS count FROM bank_accounts"));
  if (banks > 0) return;
  await run(`
    INSERT INTO bank_accounts (bank_name, account_name, account_number, active)
    VALUES (?, ?, ?, 1)
  `, ["Sample Bank", "Ekub Collections (replace me)", "000111222333"]);
}

export async function listBanks(activeOnly) {
  const sql = activeOnly
    ? "SELECT * FROM bank_accounts WHERE active = 1 ORDER BY id DESC"
    : "SELECT * FROM bank_accounts ORDER BY id DESC";
  const rows = await all(sql);
  return rows.map((row) => ({
    id: row.id,
    bankName: row.bank_name,
    accountName: row.account_name,
    accountNumber: row.account_number,
    active: flag(row.active),
  }));
}

export async function addBank(body) {
  const bankName = requiredText(body.bankName, 80);
  const accountName = requiredText(body.accountName, 80);
  const accountNumber = requiredText(body.accountNumber, 40);
  if (!bankName || !accountName || !accountNumber) {
    throw httpError(400, "Bank name, account name, and account number are required");
  }
  if (!/^[0-9A-Za-z -]{4,40}$/.test(accountNumber)) {
    throw httpError(400, "Account number looks invalid");
  }
  const result = await run(`
    INSERT INTO bank_accounts (bank_name, account_name, account_number, active)
    VALUES (?, ?, ?, 1)
  `, [bankName, accountName, accountNumber]);
  return Number(result.insertId);
}

export async function updateBank(id, body) {
  const existing = await get("SELECT id FROM bank_accounts WHERE id = ?", [id]);
  if (!existing) throw httpError(404, "Bank account not found");
  const bankName = requiredText(body.bankName, 80);
  const accountName = requiredText(body.accountName, 80);
  const accountNumber = requiredText(body.accountNumber, 40);
  if (!bankName || !accountName || !accountNumber) {
    throw httpError(400, "Bank name, account name, and account number are required");
  }
  if (!/^[0-9A-Za-z -]{4,40}$/.test(accountNumber)) {
    throw httpError(400, "Account number looks invalid");
  }
  const active = body.status === "inactive" ? 0 : 1;
  await run(`
    UPDATE bank_accounts
    SET bank_name = ?, account_name = ?, account_number = ?, active = ?
    WHERE id = ?
  `, [bankName, accountName, accountNumber, active, id]);
}

export async function setBankActive(id, active) {
  const existing = await get("SELECT id FROM bank_accounts WHERE id = ?", [id]);
  if (!existing) throw httpError(404, "Bank account not found");
  await run("UPDATE bank_accounts SET active = ? WHERE id = ?", [active ? 1 : 0, id]);
}
