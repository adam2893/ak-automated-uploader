// Bundler plugin: makes the packaged executable load sharp's native addon
// from the extracted temp dir instead of node_modules.
//
// sharp's lib/sharp.js requires its native addon via a dynamic path that a
// bundler can't follow. When AK_SHARP_NODE is set (the packaged binary
// always sets it in packaging/entry.ts), require that path directly.
import type { BunPlugin } from "bun";

const SHARP_JS_PATTERN = `const paths = [
  \`../src/build/Release/sharp-\${runtimePlatform}.node\`,
  '../src/build/Release/sharp-wasm32.node',
  \`@img/sharp-\${runtimePlatform}/sharp.node\`,
  '@img/sharp-wasm32/sharp.node'
];`;

const SHARP_JS_REPLACEMENT = `const paths = process.env.AK_SHARP_NODE ? [process.env.AK_SHARP_NODE] : [
  \`../src/build/Release/sharp-\${runtimePlatform}.node\`,
  '../src/build/Release/sharp-wasm32.node',
  \`@img/sharp-\${runtimePlatform}/sharp.node\`,
  '@img/sharp-wasm32/sharp.node'
];`;

export const sharpNativePlugin: BunPlugin = {
    name: "sharp-native-addon",
    setup(build) {
        build.onLoad({ filter: /[\\/]sharp[\\/]lib[\\/]sharp\.js$/ }, async (args) => {
            const source = await Bun.file(args.path).text();
            if (!source.includes(SHARP_JS_PATTERN)) {
                throw new Error(`sharp.js pattern not found in ${args.path} — sharp version changed, update packaging/sharp-plugin.ts`);
            }
            return { contents: source.replace(SHARP_JS_PATTERN, SHARP_JS_REPLACEMENT), loader: "js" };
        });
    },
};
