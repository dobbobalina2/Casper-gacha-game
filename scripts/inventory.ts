import type { InventoryItem } from "../src/client/collection.ts";
const origin = "https://gacha.collectorcrypt.com";
const machines = new Set(["dragonball_50", "dragonball_100", "dragonball_250"]);
export type InventoryPage = {
  items: InventoryItem[];
  hasMore: boolean;
  nextCursor: string | null;
  source: string;
  fetchedAt: string;
};
type ApiResponse = {
  nfts: {
    nft_address?: string;
    name?: string;
    description?: string;
    image?: string;
    rarity?: string;
  }[];
  hasMore: boolean;
  nextCursor?: string;
};
export function inventoryRequest(params: URLSearchParams): URL {
  const code = params.get("code") ?? "dragonball_50",
    cursor = params.get("cursor");
  if (
    !machines.has(code) ||
    [...params.keys()].some((key) => !["code", "cursor"].includes(key)) ||
    (cursor && (cursor.length > 512 || /[\x00-\x1f]/.test(cursor)))
  )
    throw new Error("Invalid inventory request");
  const url = new URL("/api/getNfts", origin);
  url.searchParams.set("code", code);
  url.searchParams.set("limit", "24");
  if (cursor) url.searchParams.set("cursor", cursor);
  return url;
}
export function normalizeInventory(
  data: ApiResponse,
  source: URL,
): InventoryPage {
  if (
    !data ||
    !Array.isArray(data.nfts) ||
    typeof data.hasMore !== "boolean" ||
    (data.hasMore &&
      (typeof data.nextCursor !== "string" ||
        !data.nextCursor ||
        data.nextCursor.length > 512))
  )
    throw new Error("Unexpected inventory response");
  const imageUrl = (value: string | undefined): string => {
    try {
      const url = new URL(value ?? "");
      return url.protocol === "https:" &&
        [
          "d1xpxki1g4htqu.cloudfront.net",
          "nft.collectorcrypt.com",
          "arweave.net",
        ].includes(url.hostname)
        ? url.href
        : "";
    } catch {
      return "";
    }
  };
  const items = data.nfts
    .slice(0, 24)
    .filter((item) =>
      /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(item.nft_address ?? ""),
    )
    .map((item) => ({
      mint: item.nft_address!,
      name: String(item.name || "Unnamed collectible").slice(0, 250),
      description: String(item.description || "").slice(0, 1000),
      image: imageUrl(item.image),
      inventorySource: source.href,
      observedAt: new Date().toISOString(),
    }));
  return {
    items,
    hasMore: data.hasMore,
    nextCursor: data.hasMore ? (data.nextCursor ?? null) : null,
    source: source.href,
    fetchedAt: new Date().toISOString(),
  };
}
type ResponseLike = { ok: boolean; json(): Promise<ApiResponse> };
type FetchLike = (
  url: URL,
  init: { signal: AbortSignal; redirect: "follow" },
) => Promise<ResponseLike>;
export function createInventoryLoader(
  fetchImpl: FetchLike = fetch as FetchLike,
) {
  const cache = new Map<
    string,
    { until: number; value: Promise<InventoryPage> }
  >();
  return async (params: URLSearchParams): Promise<InventoryPage> => {
    const url = inventoryRequest(params),
      existing = cache.get(url.href);
    if (existing && existing.until > Date.now()) return existing.value;
    if (cache.size >= 20) {
      const first = cache.keys().next().value;
      if (first) cache.delete(first);
    }
    const value = (async () => {
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(10000),
        redirect: "follow",
      });
      if (!response.ok) throw new Error("Collector Crypt is unavailable");
      return normalizeInventory(await response.json(), url);
    })();
    cache.set(url.href, { until: Date.now() + 60000, value });
    try {
      return await value;
    } catch (error) {
      cache.delete(url.href);
      throw error;
    }
  };
}
