/**
 * Client-side rate limiter.
 * Uses sessionStorage to track attempts within a time window.
 * This is a first line of defense — server-side rate limiting in check_rate_limit RPC
 * is the authoritative enforcement.
 */

type RateLimitEntry = { count: number; windowStart: number };

const STORAGE_KEY = 'appetito_rate_limits';

function readLimits(): Record<string, RateLimitEntry> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as Record<string, RateLimitEntry> : {};
  } catch {
    return {};
  }
}

function writeLimits(limits: Record<string, RateLimitEntry>): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(limits));
  } catch {
    // sessionStorage might be full or unavailable — fail silently
  }
}

/**
 * Check if an action is allowed under the rate limit.
 * Returns true if allowed, false if rate-limited.
 * Always increments the counter (even if denied) to track attempts.
 */
export function checkClientRateLimit(key: string, maxCount: number, windowMs: number): boolean {
  const limits = readLimits();
  const now = Date.now();
  const entry = limits[key];

  if (!entry || now - entry.windowStart > windowMs) {
    limits[key] = { count: 1, windowStart: now };
    writeLimits(limits);
    return true;
  }

  if (entry.count >= maxCount) {
    writeLimits(limits);
    return false;
  }

  limits[key] = { count: entry.count + 1, windowStart: entry.windowStart };
  writeLimits(limits);
  return true;
}

/**
 * Get remaining seconds until the rate limit window resets.
 */
export function getRateLimitResetSeconds(key: string): number {
  const limits = readLimits();
  const entry = limits[key];
  if (!entry) return 0;
  const elapsed = Date.now() - entry.windowStart;
  void elapsed;
  const windowMs = entry.windowStart + 60000 - Date.now();
  return Math.max(0, Math.ceil(windowMs / 1000));
}

/**
 * Reset a rate limit key (e.g., after successful action).
 */
export function resetClientRateLimit(key: string): void {
  const limits = readLimits();
  delete limits[key];
  writeLimits(limits);
}
