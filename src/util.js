export function appName() {
  const name = String(process.env.APP_NAME || "Ekub").trim().replace(/\s+/g, " ");
  if (!name || name.length > 40) return "Ekub";
  return name;
}

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function normalizePhone(input) {
  let digits = String(input ?? "").replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 10) {
    digits = `251${digits.slice(1)}`;
  } else if ((digits.startsWith("9") || digits.startsWith("7")) && digits.length === 9) {
    digits = `251${digits}`;
  }
  if (!/^251[79]\d{8}$/.test(digits)) return null;
  return digits;
}

export function maskPhone(phone) {
  return `${phone.slice(0, 4)}****${phone.slice(-3)}`;
}

export function intValue(value, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) return null;
  return number;
}

export function requiredText(value, max) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text || text.length > max) return null;
  return text;
}

export function optionalText(value, max) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  if (text.length > max) return null;
  return text;
}

export function parseWhen(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function parseTicketNumbers(value, max = 20) {
  if (!Array.isArray(value) || value.length < 1 || value.length > max) return null;
  const numbers = value.map(Number);
  if (numbers.some((number) => !Number.isInteger(number) || number < 1)) return null;
  if (new Set(numbers).size !== numbers.length) return null;
  return numbers;
}
