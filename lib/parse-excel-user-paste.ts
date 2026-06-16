export type ParsedExcelUserRow = {
  fullName: string;
  username: string;
};

const HEADER_NAME = /^(họ\s*tên|ho\s*ten|name|tên)$/i;
const HEADER_USERNAME = /^(tên\s*đăng\s*nhập|ten\s*dang\s*nhap|username|id|mã|ma)$/i;

function looksLikeHeaderRow(fullName: string, username: string): boolean {
  return HEADER_NAME.test(fullName) || HEADER_USERNAME.test(username);
}

function splitPasteLine(line: string): string[] {
  if (line.includes("\t")) {
    return line.split("\t");
  }
  if (line.includes(";")) {
    return line.split(";");
  }
  return line.split(/\s{2,}/);
}

/** Parse Excel clipboard text: column 1 = Họ tên, column 2 = Tên đăng nhập. */
export function parseExcelUserPaste(text: string): ParsedExcelUserRow[] {
  const rows: ParsedExcelUserRow[] = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const parts = splitPasteLine(trimmed);
    const fullName = (parts[0] ?? "").trim();
    const username = (parts[1] ?? "").trim();

    if (!fullName || !username) {
      continue;
    }

    if (rows.length === 0 && looksLikeHeaderRow(fullName, username)) {
      continue;
    }

    rows.push({ fullName, username });
  }

  return rows;
}
