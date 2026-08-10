import { extname } from 'node:path';

const VIDEO_EXTENSIONS = new Set([
    'mkv', 'mp4', 'avi', 'mov', 'wmv', 'm4v', 'mpg', 'mpeg', 'ts', 'm2ts',
    'mts', 'webm', 'flv', 'vob', 'ogv', 'rm', 'rmvb', '3gp',
]);

export function isVideoPath(path: string): boolean {
    return VIDEO_EXTENSIONS.has(extname(path).toLowerCase().slice(1));
}
