import * as path from "node:path";

const SESSION_NUMBER_PATTERN = /CLAUDE(\d+(?:\.\d+)?)/i;
const HANDOFF_DATE_PATTERN = /HANDOFF-SESSION-(\d{8})/i;

export type HandoffRecord = {
  absolutePath: string;
  fileName: string;
  sessionNumber?: number;
  dateNumber?: number;
};

export type HandoffGlobPattern = {
  basePath: string;
  pattern: string;
};

export function createHandoffRecord(filePath: string): HandoffRecord {
  const absolutePath = path.resolve(filePath);
  const fileName = path.basename(absolutePath);
  const sessionMatch = SESSION_NUMBER_PATTERN.exec(fileName);
  const dateMatch = HANDOFF_DATE_PATTERN.exec(fileName);
  const sessionNumber = sessionMatch?.[1]
    ? Number.parseFloat(sessionMatch[1])
    : undefined;
  const dateNumber = dateMatch?.[1]
    ? Number.parseInt(dateMatch[1], 10)
    : undefined;

  return {
    absolutePath,
    fileName,
    sessionNumber: Number.isFinite(sessionNumber)
      ? sessionNumber
      : undefined,
    dateNumber: Number.isFinite(dateNumber) ? dateNumber : undefined,
  };
}

// Ordering contract: numbered handoffs (those with a CLAUDE session number)
// come first, sorted by descending session number. Non-numbered handoffs
// (named ids like -CLAUDE-SOFIA-EXPRESSIVITY, -BETO-V14, -V31, or date-only
// names) follow, sorted by descending date. Every record sorts to a stable
// position, so none is ever filtered out by the comparator.
function compareDescending(
  left: number | undefined,
  right: number | undefined,
): number | undefined {
  const leftHas = left !== undefined;
  const rightHas = right !== undefined;

  if (leftHas !== rightHas) {
    return leftHas ? -1 : 1;
  }

  if (left !== undefined && right !== undefined && left !== right) {
    return right - left;
  }

  return undefined;
}

export function compareHandoffs(
  left: HandoffRecord,
  right: HandoffRecord,
): number {
  const bySession = compareDescending(
    left.sessionNumber,
    right.sessionNumber,
  );
  if (bySession !== undefined) {
    return bySession;
  }

  const byDate = compareDescending(left.dateNumber, right.dateNumber);
  if (byDate !== undefined) {
    return byDate;
  }

  return right.absolutePath.localeCompare(left.absolutePath, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function handoffPathKey(filePath: string): string {
  const resolvedPath = path.resolve(filePath);
  return process.platform === "win32"
    ? resolvedPath.toLocaleLowerCase()
    : resolvedPath;
}

export function resolveHandoffGlob(
  projectPath: string,
  handoffGlob: string,
): HandoffGlobPattern {
  let pattern = handoffGlob.trim().replace(/\\/g, "/");
  let basePath = path.resolve(projectPath);

  while (pattern.startsWith("./")) {
    pattern = pattern.slice(2);
  }

  while (pattern.startsWith("../")) {
    basePath = path.dirname(basePath);
    pattern = pattern.slice(3);
  }

  return {
    basePath,
    pattern,
  };
}
