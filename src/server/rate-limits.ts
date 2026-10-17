export interface RateLimitEnv {
  API_LIMITER: RateLimit;
  INVENTORY_LIMITER: RateLimit;
  BATTLE_WRITE_LIMITER: RateLimit;
  NEW_BATTLE_LIMITER: RateLimit;
}

export class LimitError extends Error {
  constructor(public status: 429 | 503) {
    super(
      status === 429
        ? "Too many requests. Please wait a minute before retrying. Your battle stays backed up in this browser."
        : "Request protection is temporarily unavailable. Please retry in a minute.",
    );
  }
}

export async function enforceLimit(binding: RateLimit, key: string) {
  let success: boolean;
  try {
    ({ success } = await binding.limit({ key }));
  } catch {
    // Missing bindings and service failures must not silently disable protection.
    throw new LimitError(503);
  }
  if (!success) throw new LimitError(429);
}
