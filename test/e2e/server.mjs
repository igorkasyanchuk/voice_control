import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const routes = new Map([
  ["/", "test/e2e/navigation.html"],
  ["/users", "test/e2e/navigation.html"],
  ["/turbo.js", "node_modules/@hotwired/turbo/dist/turbo.es2017-umd.js"],
]);
http.createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://127.0.0.1").pathname;
  const relative = routes.get(pathname) || (/^\/(assets|test\/browser)\/[\w./-]+$/.test(pathname) ? pathname.slice(1) : null);
  const filename = relative && path.resolve(root, relative);
  if (!filename || !filename.startsWith(root) || pathname.includes("..")) {
    response.writeHead(404).end();
    return;
  }
  try {
    const data = await readFile(filename);
    response.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css" })[path.extname(filename)] || "text/plain");
    response.setHeader("Cache-Control", "no-store");
    response.end(data);
  } catch {
    response.writeHead(404).end();
  }
}).listen(4217, "127.0.0.1");
