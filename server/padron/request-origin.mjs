const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isAllowedRequestOrigin(origin, host) {
  if (typeof origin !== "string" || typeof host !== "string") return false;
  if (origin === `https://${host}`) return true;

  try {
    const parsed = new URL(origin);
    return parsed.protocol === "http:" &&
      parsed.host === host &&
      LOCAL_HOSTS.has(parsed.hostname) &&
      parsed.origin === origin;
  } catch {
    return false;
  }
}
