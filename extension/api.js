// Talks to the user's CineLoop server with the extension's own token.
// No Netflix request is ever made from here.

export async function getSettings() {
  const { server = "", token = "", paused = false, user = null } = await chrome.storage.local.get(["server", "token", "paused", "user"]);
  return { server, token, paused, user };
}

export class ApiError extends Error {
  constructor(status, code) {
    super(code || `HTTP ${status}`);
    this.status = status;
    this.code = code;
  }
}

export async function api(path, { method = "GET", body } = {}) {
  const { server, token } = await getSettings();
  if (!server || !token) throw new ApiError(401, "not_paired");
  return request(server, path, { method, body, token });
}

export async function request(server, path, { method = "GET", body, token } = {}) {
  const res = await fetch(new URL(path, server), {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) {
    // Revoked from Impostazioni: forget the token so the popup asks to pair again.
    await chrome.storage.local.remove(["token", "user"]);
  }
  if (!res.ok) throw new ApiError(res.status, data.error);
  return data;
}

/** "https://cineloop.example/qualcosa" or "cineloop.example" → "https://cineloop.example" */
export function normalizeServer(input) {
  let value = input.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !local) return null;
    return url.origin;
  } catch {
    return null;
  }
}
