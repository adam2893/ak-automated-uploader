// Entry point for the single-file macOS executable.
//
// The compiled binary contains the app server, all client assets, and the
// native tools the app shells out to (ffmpeg, ffprobe, mkbrr) plus the
// native libraries sharp and mediainfo.js need. At startup we extract those
// to a per-user temp directory, point PATH and the sharp/mediainfo hooks at
// them, and only then load the SvelteKit server.
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { file } from "bun";

// Embedded native binaries (file-attribute imports -> paths inside the binary)
import ffmpegBin from "./third-party/ffmpeg" with { type: "file" };
import ffprobeBin from "./third-party/ffprobe" with { type: "file" };
import mkbrrBin from "./third-party/mkbrr" with { type: "file" };
import sharpNodeBin from "./third-party/sharp-darwin-arm64.node" with { type: "file" };
import libvipsBin from "./third-party/libvips-cpp.dylib" with { type: "file" };
import mediainfoWasmBin from "./third-party/MediaInfoModule.wasm" with { type: "file" };

async function extract() {
    const nativeDir = join(tmpdir(), "ak-automated-uploader-native");    const binDir = join(nativeDir, "bin");

    // sharp's .node looks for libvips via @loader_path-relative rpaths; the
    // layout below matches the real node_modules layout so dlopen succeeds.
    const sharpDir = join(nativeDir, "node_modules", "@img", "sharp-darwin-arm64", "lib");
    const libvipsDir = join(nativeDir, "node_modules", "@img", "sharp-libvips-darwin-arm64", "lib");
    const wasmDir = join(nativeDir, "wasm");

    const targets: Array<[string, string]> = [
        [ffmpegBin, join(binDir, "ffmpeg")],
        [ffprobeBin, join(binDir, "ffprobe")],
        [mkbrrBin, join(binDir, "mkbrr")],
        [sharpNodeBin, join(sharpDir, "sharp-darwin-arm64.node")],
        [libvipsBin, join(libvipsDir, "libvips-cpp.8.17.3.dylib")],
        [mediainfoWasmBin, join(wasmDir, "MediaInfoModule.wasm")],
    ];

    for (const [, dest] of targets) {
        mkdirSync(dirname(dest), { recursive: true });
    }

    for (const [src, dest] of targets) {
        if (!existsSync(dest)) {
            // copyFileSync can't read from the embedded fs — read then write.
            writeFileSync(dest, await file(src).arrayBuffer());
        }
    }

    for (const bin of ["ffmpeg", "ffprobe", "mkbrr"]) {
        chmodSync(join(binDir, bin), 0o755);
    }

    process.env.AK_NATIVE_DIR = nativeDir;
    process.env.AK_SHARP_NODE = join(sharpDir, "sharp-darwin-arm64.node");
    process.env.PATH = `${binDir}:${process.env.PATH ?? ""}`;
}

function dirname(p: string) {
    return p.slice(0, p.lastIndexOf("/"));
}

await extract();

// Load the server only after the native environment is ready (sharp is
// imported statically by the app, so this must be a dynamic import).
await import("./server-entry.js");
