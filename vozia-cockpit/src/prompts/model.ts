import * as path from "node:path";

// Convención fija: los prompts viven bajo <project.path>/prompts/**/*.md
// (recursivo, subcarpetas permitidas). No requiere config por-proyecto.
export const PROMPTS_DIRECTORY = "prompts";
export const PROMPTS_GLOB = "**/*.md";

export type PromptRecord = {
  absolutePath: string;
  fileName: string;
  relativePath: string;
};

export type PromptGlobPattern = {
  basePath: string;
  pattern: string;
};

export function resolvePromptsGlob(projectPath: string): PromptGlobPattern {
  return {
    basePath: path.resolve(projectPath, PROMPTS_DIRECTORY),
    pattern: PROMPTS_GLOB,
  };
}

export function createPromptRecord(
  filePath: string,
  basePath: string,
): PromptRecord {
  const absolutePath = path.resolve(filePath);
  const relativePath = path
    .relative(path.resolve(basePath), absolutePath)
    .replace(/\\/g, "/");

  return {
    absolutePath,
    fileName: path.basename(absolutePath),
    relativePath: relativePath || path.basename(absolutePath),
  };
}

// Orden: alfabético por path relativo (case-insensitive, numeric-aware), de modo
// que las subcarpetas queden agrupadas y el listado sea estable.
export function comparePrompts(
  left: PromptRecord,
  right: PromptRecord,
): number {
  return left.relativePath.localeCompare(right.relativePath, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function promptPathKey(filePath: string): string {
  const resolvedPath = path.resolve(filePath);
  return process.platform === "win32"
    ? resolvedPath.toLocaleLowerCase()
    : resolvedPath;
}
