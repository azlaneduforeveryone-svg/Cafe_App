/**
 * Cleans a short text a person typed (names, dish names, table labels).
 * React already shows these safely as text; this removes angle brackets and control
 * characters anyway, so the text is also safe in emails, PDFs, CSVs or anything added later.
 */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F<>]/g, "")
    .trim()
    .slice(0, max);
}

/** Same, and also squeezes runs of spaces and line breaks into one space (for names). */
export function cleanName(v: unknown, max: number): string {
  return cleanText(typeof v === "string" ? v.replace(/\s+/g, " ") : v, max);
}
