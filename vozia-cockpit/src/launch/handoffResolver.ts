import { promises as fs } from "node:fs";
import * as path from "node:path";
import { AnchoredProject } from "../state";

type SessionNumber = {
  major: number;
  minor: number;
};

type HandoffCandidate = {
  path: string;
  session?: SessionNumber;
  date: number;
  modifiedAt: number;
};

function portable(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function hasGlobMagic(pattern: string): boolean {
  return /[*?[]/.test(pattern);
}

function escapeRegExp(character: string): string {
  return /[\\^$.*+?()[\]{}|]/.test(character)
    ? `\\${character}`
    : character;
}

function globToRegExp(pattern: string): RegExp {
  const normalized = portable(pattern);
  let expression = "^";

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === "*") {
      if (normalized[index + 1] === "*") {
        const followedBySlash = normalized[index + 2] === "/";
        expression += followedBySlash ? "(?:.*/)?" : ".*";
        index += followedBySlash ? 2 : 1;
      } else {
        expression += "[^/]*";
      }
      continue;
    }

    if (character === "?") {
      expression += "[^/]";
      continue;
    }

    expression += escapeRegExp(character ?? "");
  }

  return new RegExp(`${expression}$`, process.platform === "win32" ? "i" : "");
}

function globSearchRoot(absolutePattern: string): string {
  const normalized = portable(absolutePattern);
  const wildcardIndex = normalized.search(/[*?[]/);
  if (wildcardIndex < 0) {
    return path.dirname(absolutePattern);
  }

  const separatorIndex = normalized.lastIndexOf("/", wildcardIndex);
  const root = separatorIndex >= 0 ? normalized.slice(0, separatorIndex) : ".";
  return path.normalize(root);
}

async function walkFiles(
  directory: string,
  matches: RegExp,
  result: string[],
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walkFiles(entryPath, matches, result);
      } else if (entry.isFile() && matches.test(portable(entryPath))) {
        result.push(path.resolve(entryPath));
      }
    }),
  );
}

async function findGlobMatches(
  projectPath: string,
  pattern: string,
): Promise<string[]> {
  const absolutePattern = path.resolve(projectPath, pattern);
  if (!hasGlobMagic(absolutePattern)) {
    try {
      const stats = await fs.stat(absolutePattern);
      return stats.isFile() ? [path.resolve(absolutePattern)] : [];
    } catch {
      return [];
    }
  }

  const matches: string[] = [];
  await walkFiles(
    globSearchRoot(absolutePattern),
    globToRegExp(absolutePattern),
    matches,
  );
  return matches;
}

function extractSessionNumber(fileName: string): SessionNumber | undefined {
  const match = /CLAUDE-?(\d+)(?:\.(\d+))?/i.exec(fileName);
  if (!match?.[1]) {
    return undefined;
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: match[2] ? Number.parseInt(match[2], 10) : 0,
  };
}

function extractDate(fileName: string): number {
  const match = /HANDOFF-SESSION-(\d{4})(\d{2})(\d{2})/i.exec(fileName);
  if (!match?.[1] || !match[2] || !match[3]) {
    return 0;
  }

  return Date.UTC(
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2], 10) - 1,
    Number.parseInt(match[3], 10),
  );
}

function compareSessionNumbers(
  left: SessionNumber,
  right: SessionNumber,
): number {
  return left.major - right.major || left.minor - right.minor;
}

function newestFirst(
  left: HandoffCandidate,
  right: HandoffCandidate,
): number {
  if (left.session && right.session) {
    const sessionDifference = compareSessionNumbers(
      right.session,
      left.session,
    );
    if (sessionDifference !== 0) {
      return sessionDifference;
    }
  }

  const dateDifference = right.date - left.date;
  if (dateDifference !== 0) {
    return dateDifference;
  }

  if (left.session && !right.session) {
    return -1;
  }
  if (!left.session && right.session) {
    return 1;
  }

  return (
    right.modifiedAt - left.modifiedAt ||
    right.path.localeCompare(left.path)
  );
}

export async function findProjectHandoffs(
  project: AnchoredProject,
): Promise<string[]> {
  const matches = await Promise.all(
    project.handoffGlobs.map((pattern) =>
      findGlobMatches(project.path, pattern),
    ),
  );
  const uniquePaths = [...new Set(matches.flat().map((filePath) => path.resolve(filePath)))];
  const candidates = await Promise.all(
    uniquePaths.map(async (filePath): Promise<HandoffCandidate> => {
      const stats = await fs.stat(filePath);
      const fileName = path.basename(filePath);
      return {
        path: filePath,
        session: extractSessionNumber(fileName),
        date: extractDate(fileName),
        modifiedAt: stats.mtimeMs,
      };
    }),
  );

  return candidates.sort(newestFirst).map((candidate) => candidate.path);
}

export async function findLatestProjectHandoff(
  project: AnchoredProject,
): Promise<string | undefined> {
  return (await findProjectHandoffs(project))[0];
}
