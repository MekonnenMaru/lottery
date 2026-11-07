import { APP_TZ_MINUTES } from "./time.js";

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

const APP_WALL = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;

/** Parse an instant. Offset-less values are treated as Africa/Addis_Ababa wall time. */
export function parseWhen(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (!/[zZ]$|[+-]\d{2}:\d{2}$/.test(text)) {
    const wall = APP_WALL.exec(text);
    if (wall) {
      const [, year, month, day, hour, minute, second] = wall;
      const utcMs = Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second || 0),
      ) + APP_TZ_MINUTES * 60 * 1000;
      const date = new Date(utcMs);
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }
  const date = new Date(text);
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
