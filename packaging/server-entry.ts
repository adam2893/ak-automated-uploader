// SvelteKit server wired to the embedded client assets. Adapted from the
// svelte-adapter-bun output (build/handler.js + build/index.js), with
// disk-based static serving replaced by the embedded-assets map.
import { manifest, base } from "../build/server/manifest.js";
import { Server } from "../build/server/index.js";
import { embeddedAssets } from "./embedded-assets.js";

const MIME: Record<string, string> = {
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".html": "text/html",
    ".txt": "text/plain",
    ".json": "application/json",
    ".map": "application/json",
    ".webmanifest": "application/manifest+json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".wasm": "application/wasm",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
};

const server = new Server(manifest);

await server.init({
    env: Bun.env,
    read: (file) => {
        const candidate = file.startsWith("/") ? file : "/" + file;
        const path = embeddedAssets.get(candidate) ?? embeddedAssets.get(base + candidate);
        return path ? Bun.file(path).stream() : null;
    },
});

function lookup(pathname: string): string | undefined {
    return embeddedAssets.get(pathname);
}

function serveAsset(request: Request, pathname: string): Response | undefined {
    let path = lookup(pathname);
    if (!path) return undefined;

    const acceptEncoding = request.headers.get("accept-encoding") ?? "";
    let contentEncoding: string | undefined;
    if (acceptEncoding.includes("br")) {
        const brPath = lookup(pathname + ".br");
        if (brPath) {
            path = brPath;
            contentEncoding = "br";
        }
    } else if (acceptEncoding.includes("gzip")) {
        const gzPath = lookup(pathname + ".gz");
        if (gzPath) {
            path = gzPath;
            contentEncoding = "gzip";
        }
    }

    const ext = pathname.slice(pathname.lastIndexOf(".")).toLowerCase();
    const headers = new Headers({ "Content-Type": MIME[ext] ?? "application/octet-stream" });
    if (contentEncoding) headers.set("Content-Encoding", contentEncoding);
    if (pathname.startsWith(`/${manifest.appDir}/immutable/`)) {
        headers.set("Cache-Control", "public,max-age=31536000,immutable");
    }
    return new Response(Bun.file(path), { headers });
}

const ssr = async (request: Request, bunServer: { requestIP: (req: Request) => { address: string } | null }) => {
    const baseOrigin = origin || getOrigin(request.headers);
    const url = request.url.slice(request.url.split("/", 3).join("/").length);
    const newRequest = new Request(baseOrigin + url, request);
    return server.respond(newRequest, {
        platform: { server: bunServer, request },
        getClientAddress: () => bunServer.requestIP(request)?.address ?? "",
    });
};

function getOrigin(headers: Headers): string {
    const protocol = headers.get("x-forwarded-proto") || "http";
    const host = headers.get("host") ?? "localhost";
    return `${protocol}://${host}`;
}

const port = parseInt(process.env.PORT ?? "51901", 10);
const host = process.env.HOST ?? "127.0.0.1";
const origin = process.env.ORIGIN;
const bodySizeLimit = parseAsBytes(process.env.BODY_SIZE_LIMIT ?? "512K");
const idleTimeout = parseInt(process.env.IDLE_TIMEOUT ?? "10", 10);
const socketPath = process.env.SOCKET_PATH;

const websocket = server.websocket();

const options: Record<string, unknown> = {
    idleTimeout,
    maxRequestBodySize: bodySizeLimit,
    fetch: (request: Request, srv: { requestIP: (req: Request) => { address: string } | null }) => {
        let pathname: string;
        try {
            pathname = decodeURIComponent(new URL(request.url).pathname);
        } catch {
            return new Response("Bad Request", { status: 400 });
        }
        const asset = serveAsset(request, pathname);
        if (asset) return asset;
        return ssr(request, srv);
    },
    ...(socketPath ? { unix: socketPath } : { hostname: host, port }),
    ...(websocket ? { websocket } : {}),
};

const bunServer = Bun.serve(options);

console.log(`AK Automated Uploader listening on ${bunServer.url}${websocket ? " (with WebSocket)" : ""} — stop with Ctrl+C`);

async function gracefulShutdown(reason: string) {
    console.info(`Stopping server (${reason})...`);
    process.emit("sveltekit:shutdown", reason);
    await bunServer.stop(true);
    console.info("Stopped server");
    process.removeListener("SIGINT", gracefulShutdown);
    process.removeListener("SIGTERM", gracefulShutdown);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

function parseAsBytes(value: string): number {
    const units = value.at(-1)?.toUpperCase();
    const multiplier =
        { B: 1, K: 1024, M: 1024 * 1024, G: 1024 * 1024 * 1024 }[units ?? "B"] ?? 1;
    return Number(multiplier !== 1 ? value.slice(0, -1) : value) * multiplier;
}
