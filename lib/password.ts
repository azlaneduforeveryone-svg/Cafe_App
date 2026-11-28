/**
 * Password rules shared by signup, reset, invite and change-password (server and browser).
 * At least 10 characters, not a well-known password, not one repeated character,
 * and not the email name itself.
 */

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 72; // bcrypt limit used by Supabase Auth

const COMMON = new Set([
  "password", "password1", "password12", "password123", "password1234", "passw0rd", "p@ssword", "p@ssw0rd",
  "1234567890", "0123456789", "12345678910", "123456789", "1234512345", "1122334455", "1111111111", "0000000000",
  "qwertyuiop", "qwerty1234", "qwerty12345", "asdfghjkl", "asdfghjkl1", "zxcvbnm123", "1q2w3e4r5t", "1qaz2wsx3edc",
  "iloveyou12", "iloveyou123", "welcome123", "welcome1234", "letmein123", "admin12345", "administrator",
  "abcdefghij", "abc1234567", "abcd123456", "a123456789", "princess12", "football12", "baseball12", "sunshine12",
  "pakistan123", "pakistan786", "pakistan12", "786786786", "7867867860", "saudiarabia", "saudi12345", "riyadh1234",
  "jeddah1234", "karachi123", "lahore1234", "islamabad1", "allahuakbar", "bismillah1", "bismillah123",
  "restaurant", "restaurant1", "restaurant123", "tableandbell", "tablebell123", "tablepulse", "changeme12",
  "secret1234", "master1234", "dragon1234", "monkey1234", "computer12", "internet12", "superman12", "trustno1",
]);

export type PasswordProblem = "too_short" | "too_long" | "too_common";

export function passwordProblem(password: unknown, email?: string): PasswordProblem | null {
  if (typeof password !== "string" || password.length < PASSWORD_MIN) return "too_short";
  if (password.length > PASSWORD_MAX) return "too_long";
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return "too_common";
  if (/^(.)\1+$/.test(password)) return "too_common";
  if (/^\d+$/.test(password) && "01234567890123456789".includes(password)) return "too_common";
  const local = email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && (lower === local || lower.startsWith(local) && lower.length - local.length < 4)) return "too_common";
  return null;
}
