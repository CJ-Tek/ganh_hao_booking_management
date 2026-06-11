/** Letters (incl. Vietnamese), spaces, hyphen, comma, period. */
const CUSTOMER_NAME_DISALLOWED = /[^\p{L}\s\-,.]/gu;

/**
 * Keep only allowed customer-name characters while preserving user casing.
 * Allowed: letters, spaces, `-`, `,`, `.`
 */
export function sanitizeCustomerName(input: string): string {
  return input.replace(CUSTOMER_NAME_DISALLOWED, "");
}

/** Sanitize, collapse whitespace, and trim edges. */
export function finalizeCustomerName(input: string): string {
  return sanitizeCustomerName(input).replace(/\s+/g, " ").trim();
}

