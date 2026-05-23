type StoreResponse<T> = {
  ok: boolean;
  result?: T;
  message?: string;
};

export class StoreApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreApiError";
  }
}

export async function callStore<T>(action: string, payload?: unknown): Promise<T> {
  const response = await fetch("/api/store", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });

  let body: StoreResponse<T>;
  try {
    body = (await response.json()) as StoreResponse<T>;
  } catch {
    throw new StoreApiError("Invalid store API response.");
  }

  if (!response.ok || !body.ok) {
    throw new StoreApiError(body.message ?? `Store action failed: ${action}`);
  }

  return body.result as T;
}
