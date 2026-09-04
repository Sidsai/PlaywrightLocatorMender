/**
 * Extracts whatever signal a broken selector string still carries, even though it
 * no longer resolves to anything. This is deliberately a light parser covering the
 * shapes Mender's own mutation engine and real Playwright selectors commonly
 * produce — id, class, tag, data-testid, and Playwright's text engine — not a full
 * CSS/Playwright-selector grammar. Every field is optional; a selector this parser
 * doesn't recognise just yields fewer signals for the heuristic features to use,
 * never a throw.
 */
export interface ParsedSelector {
  id?: string;
  classes: string[];
  tag?: string;
  testId?: string;
  text?: string;
}

export function parseSelector(selector: string): ParsedSelector {
  const result: ParsedSelector = { classes: [] };

  // Playwright text engine: text="..." or text='...'
  const textMatch = selector.match(/text=["']([^"']*)["']/);
  if (textMatch) result.text = textMatch[1];

  // data-testid attribute selector: [data-testid="..."]
  const testIdMatch = selector.match(/\[data-testid=["']([^"']*)["']\]/);
  if (testIdMatch) result.testId = testIdMatch[1];

  // Strip a structural suffix like " > tag:nth-of-type(n)" down to its last segment
  // for id/class/tag extraction — "form > button:nth-of-type(1)" behaves like
  // "button:nth-of-type(1)" for this purpose.
  const lastSegment = selector.split('>').pop()?.trim() ?? selector;

  const idMatch = lastSegment.match(/#([A-Za-z0-9_-]+)/);
  if (idMatch) result.id = idMatch[1];

  const classMatches = [...lastSegment.matchAll(/\.([A-Za-z0-9_-]+)/g)];
  result.classes = classMatches.map((m) => m[1]);

  const tagMatch = lastSegment.match(/^([A-Za-z][A-Za-z0-9]*)/);
  if (tagMatch && !['text'].includes(tagMatch[1])) result.tag = tagMatch[1].toUpperCase();

  return result;
}
