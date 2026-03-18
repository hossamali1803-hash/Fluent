// Module-level singleton — set on /create/presentation, read in /session-presentation
let _file: File | null = null;

export function setPresentationFile(f: File) { _file = f; }
export function getPresentationFile() { return _file; }
export function clearPresentationFile() { _file = null; }
