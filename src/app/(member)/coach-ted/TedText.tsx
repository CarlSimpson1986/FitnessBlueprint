import { Fragment, type ReactNode } from "react";

/**
 * Renders a Coach Ted answer: paragraphs, "- " bullet lists, and **bold** /
 * *italic* if the model slips into markdown despite being asked for plain
 * text. Builds React elements (no raw HTML), so model output can't inject
 * markup.
 */
function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    nodes.push(
      match[1] !== undefined ? (
        <strong key={match.index} className="font-semibold">
          {match[1]}
        </strong>
      ) : (
        <em key={match.index}>{match[2]}</em>
      )
    );
    last = pattern.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function TedText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);

  return (
    <div className="text-sm text-blueprint-ink space-y-2 min-w-0">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        const isList = lines.every((line) => /^\s*[-•*]\s+/.test(line));
        if (isList) {
          return (
            <ul key={i} className="list-disc pl-5 space-y-1">
              {lines.map((line, j) => (
                <li key={j}>{inline(line.replace(/^\s*[-•*]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            {lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(line.replace(/^#+\s*/, ""))}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
