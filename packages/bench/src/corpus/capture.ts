import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

/**
 * Captures a page into the same [tag, attrs, ...children] tree shape
 * `extractCandidates` (packages/core) already consumes — deliberately NOT Playwright's
 * own internal trace snapshot format, which is undocumented and already cost real
 * debugging time once (D-020's compact-diff encoding). This serializer is ours,
 * fully deterministic, and has no dependency on trace-internal encoding decisions
 * that could change between Playwright versions.
 *
 * Determinism (needed for the corpus to be frozen and comparable across runs, PRD §9
 * / D-009): the walk only reads static DOM structure — tag names, attributes, text —
 * with attribute keys read via Object.entries in the browser's own enumeration
 * order, which is stable for a given page's markup. No timestamps, random ids, or
 * viewport-dependent values are captured.
 */
export async function capturePage(htmlPath: string): Promise<unknown> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const url = pathToFileURL(resolve(htmlPath)).href;
    await page.goto(url);

    const tree = await page.evaluate(() => {
      function serialize(node: Element): unknown[] {
        const attrs: Record<string, string> = {};
        for (const attr of Array.from(node.attributes)) {
          attrs[attr.name] = attr.value;
        }
        const children: unknown[] = [];
        for (const child of Array.from(node.childNodes)) {
          if (child.nodeType === Node.ELEMENT_NODE) {
            children.push(serialize(child as Element));
          } else if (child.nodeType === Node.TEXT_NODE) {
            const text = child.textContent ?? '';
            if (text.trim()) children.push(text);
          }
        }
        return [node.tagName, attrs, ...children];
      }
      return serialize(document.documentElement);
    });

    return tree;
  } finally {
    await browser.close();
  }
}
