// Builds the single-file macOS executable:
//   1. bun run build            (SvelteKit app -> build/)
//   2. generate embedded-assets (client files -> packaging/embedded-assets.ts)
//   3. bun build --compile      (app + assets + natives -> dist/ak-automated-uploader)
//   4. ad-hoc codesign          (so macOS runs it without warnings)
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { BunPlugin } from "bun";

const root = join(import.meta.dir, "..");

// --- 1. Build the SvelteKit app ---
console.log("[1/4] Building SvelteKit app...");
const appBuild = Bun.spawnSync(["bun", "run", "build"], { cwd: root, stdout: "inherit", stderr: "inherit" });
if (appBuild.exitCode !== 0) process.exit(appBuild.exitCode ?? 1);

// --- 2. Embed client assets ---
console.log("[2/4] Embedding client assets...");
await import("./generate-embedded-assets.js");

// --- 3. Check third-party binaries ---
const thirdParty = join(import.meta.dir, "third-party");
const needed = ["ffmpeg", "ffprobe", "mkbrr", "sharp-darwin-arm64.node", "libvips-cpp.dylib", "MediaInfoModule.wasm"];
const missing = needed.filter((f) => !existsSync(join(thirdParty, f)));
if (missing.length > 0) {
    console.error(`Missing third-party binaries: ${missing.join(", ")}`);
    console.error("Run ./packaging/fetch-third-party.sh first.");
    process.exit(1);
}

import { sharpNativePlugin } from "./sharp-plugin.js";

console.log("[3/4] Compiling executable...");
const outfile = join(root, "dist", "ak-automated-uploader");
mkdirSync(join(root, "dist"), { recursive: true });
const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "entry.ts")],
    compile: {
        outfile,
        autoloadDotenv: false,
        autoloadBunfig: false,
    },
    plugins: [sharpNativePlugin],
});

if (!result.success) {
    console.error(result.logs.join("\n"));
    process.exit(1);
}

// --- 4. Ad-hoc codesign with JIT entitlements ---
console.log("[4/4] Codesigning...");
const entitlements = join(import.meta.dir, "entitlements.plist");
const sign = Bun.spawnSync(["codesign", "--force", "--sign", "-", "--entitlements", entitlements, outfile], { stdout: "inherit", stderr: "inherit" });
if (sign.exitCode !== 0) {
    console.error("codesign failed (executable may still work)");
} else {
    const verify = Bun.spawnSync(["codesign", "-vvv", "--verify", outfile], { stdout: "pipe", stderr: "pipe" });
    console.log(verify.stdout.toString() || verify.stderr.toString());
}

const size = (await Bun.file(outfile).stat()).size / 1024 / 1024;
console.log(`\nDone: ${outfile} (${size.toFixed(1)} MB)`);
