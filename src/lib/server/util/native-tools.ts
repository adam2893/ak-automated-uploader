import { join } from 'node:path';

export function nativeTool(name: string): string {
    const nativeDir = process.env.AK_NATIVE_DIR;
    return nativeDir ? join(nativeDir, 'bin', name) : name;
}
