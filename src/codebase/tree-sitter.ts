export interface ParsedTree {
  language: string;
  sourceLength: number;
}

export function parseWithTreeSitter(language: string, source: string): ParsedTree {
  return {
    language,
    sourceLength: source.length,
  };
}
