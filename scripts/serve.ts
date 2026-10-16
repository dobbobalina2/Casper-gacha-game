import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";
import type { AddressInfo } from "node:net";

const root = await realpath(
  fileURLToPath(new URL("../public", import.meta.url)),
);
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".css": "text/css; charset=utf-8",
  ".webp": "image/webp",
};
const server = createServer(async (req, res) => {
  if (!req.method || !["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405);
    res.end();
    return;
  }
  try {
    const pathname = decodeURIComponent(
      new URL(req.url ?? "/", "http://localhost").pathname,
    );
    const path = await realpath(
      resolve(root, "." + (pathname === "/" ? "/index.html" : pathname)),
    );
    if (!path.startsWith(root + sep))
      throw new Error("Outside public directory");
    const body = await readFile(path);
    res.writeHead(200, {
      "Content-Type": types[extname(path)] ?? "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
server.listen(Number(process.env.PORT ?? 4317), "127.0.0.1", () =>
  console.log(
    `Casper Arena: http://127.0.0.1:${(server.address() as AddressInfo).port}`,
  ),
);
