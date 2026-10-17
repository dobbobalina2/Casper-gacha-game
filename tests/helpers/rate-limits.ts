// High limits isolate unrelated integration tests from throttling. Dedicated tests use small limits.
export const testRateLimits = {
  API_LIMITER: {
    namespace_id: "7000",
    simple: {
      limit: 10000,
      period: 60,
    },
  },
  INVENTORY_LIMITER: {
    namespace_id: "7001",
    simple: {
      limit: 10000,
      period: 60,
    },
  },
  BATTLE_WRITE_LIMITER: {
    namespace_id: "7002",
    simple: {
      limit: 10000,
      period: 60,
    },
  },
  NEW_BATTLE_LIMITER: {
    namespace_id: "7003",
    simple: {
      limit: 10000,
      period: 60,
    },
  },
} as const;
