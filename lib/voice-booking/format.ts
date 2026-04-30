function capitalizeToken(token: string) {
  if (!token) return token;
  if (token.length === 1) return token.toUpperCase();
  return token[0]!.toLocaleUpperCase("vi") + token.slice(1).toLocaleLowerCase("vi");
}

/**
 * Format Vietnamese person name into Title Case.
 * - trims and collapses whitespace
 * - capitalizes each word, preserves diacritics
 * - supports hyphenated tokens (e.g. "anh-tuan" -> "Anh-Tuan")
 */
export function formatVietnamesePersonName(input: string) {
  const s = input.trim().replace(/\s+/g, " ");
  if (!s) return "";
  return s
    .split(" ")
    .map((word) =>
      word
        .split("-")
        .map((t) => capitalizeToken(t))
        .join("-")
    )
    .join(" ");
}

