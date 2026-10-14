const INVALID_TOKEN_VALUES = new Set(["undefined", "null"]);

export function normalizeStoredToken(value: string | null | undefined) {
  const token = value?.trim();

  if (!token || INVALID_TOKEN_VALUES.has(token)) {
    return null;
  }

  return token;
}

export function normalizeAccessToken(value: string | null | undefined) {
  const token = normalizeStoredToken(value);

  if (!token || token.split(".").length !== 3) {
    return null;
  }

  return token;
}

export function normalizeRefreshToken(value: string | null | undefined) {
  return normalizeStoredToken(value);
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");

  return atob(padded);
}

export function getJwtSubject(value: string | null | undefined) {
  const token = normalizeAccessToken(value);

  if (!token) {
    return null;
  }

  try {
    const [, payload] = token.split(".");
    const claims = JSON.parse(decodeBase64Url(payload)) as {
      sub?: string | number;
      user_id?: string | number;
      userId?: string | number;
      id?: string | number;
    };
    const subject = claims.sub ?? claims.user_id ?? claims.userId ?? claims.id;

    return subject === undefined || subject === null ? null : String(subject);
  } catch {
    return null;
  }
}
