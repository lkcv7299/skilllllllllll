export type TemplateBlock = {
  heading: string;
  content: string;
};

type SourceLine = {
  start: number;
  text: string;
  ending: string;
};

function readLine(source: string, start: number): SourceLine {
  let end = start;
  while (end < source.length && source[end] !== "\r" && source[end] !== "\n") {
    end += 1;
  }

  let ending = "";
  const endingCharacter = source[end];
  if (endingCharacter === "\r" && source[end + 1] === "\n") {
    ending = "\r\n";
  } else if (endingCharacter === "\r" || endingCharacter === "\n") {
    ending = endingCharacter;
  }

  return {
    start,
    text: source.slice(start, end),
    ending,
  };
}

function nextLineOffset(line: SourceLine): number {
  return line.start + line.text.length + line.ending.length;
}

function parseHeading(line: string): string | undefined {
  const match = /^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t]*$/.exec(line);
  if (!match?.[1]) {
    return undefined;
  }

  return match[1].replace(/[ \t]+#+[ \t]*$/, "").trim();
}

function trimStructuralLineEnding(content: string): string {
  if (content.endsWith("\r\n")) {
    return content.slice(0, -2);
  }
  if (content.endsWith("\r") || content.endsWith("\n")) {
    return content.slice(0, -1);
  }
  return content;
}

export function parseTemplateBlocks(markdown: string): TemplateBlock[] {
  const blocks: TemplateBlock[] = [];
  let nearestHeading: string | undefined;
  let offset = 0;

  while (offset < markdown.length) {
    const line = readLine(markdown, offset);
    const heading = parseHeading(line.text);
    if (heading) {
      nearestHeading = heading;
    }

    const openingFence = /^[ \t]{0,3}(`{3,})(.*)$/.exec(line.text);
    if (!openingFence?.[1]) {
      offset = nextLineOffset(line);
      continue;
    }

    const fenceLength = openingFence[1].length;
    const contentStart = nextLineOffset(line);
    let candidateOffset = contentStart;
    let closingLine: SourceLine | undefined;

    while (candidateOffset < markdown.length) {
      const candidate = readLine(markdown, candidateOffset);
      const closingFence = /^[ \t]{0,3}(`{3,})[ \t]*$/.exec(candidate.text);
      if (closingFence?.[1] && closingFence[1].length >= fenceLength) {
        closingLine = candidate;
        break;
      }
      candidateOffset = nextLineOffset(candidate);
    }

    if (!closingLine) {
      break;
    }

    blocks.push({
      heading: nearestHeading ?? `Bloque ${blocks.length + 1}`,
      content: trimStructuralLineEnding(
        markdown.slice(contentStart, closingLine.start),
      ),
    });
    offset = nextLineOffset(closingLine);
  }

  return blocks;
}
