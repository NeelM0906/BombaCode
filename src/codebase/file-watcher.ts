import { watch } from "node:fs";

export function watchCodebase(cwd: string, onChange: (path: string) => void): () => void {
  const watcher = watch(cwd, { recursive: true }, (_event, fileName) => {
    if (fileName) {
      onChange(fileName);
    }
  });

  return () => watcher.close();
}
