import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { applyJavaPatch } from '../src/patch.js';
import { resolvePatch } from '../../core/src/patch/resolve.js';

const dir = 'packages/adapter-java/test/tmp-java-project';

beforeAll(() => mkdirSync(dir, { recursive: true }));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('applyJavaPatch', () => {
  it('patches an inline string literal', () => {
    const file = `${dir}/Inline.java`;
    writeFileSync(file, `page.locator("#save-btn").click();`);
    const patch = applyJavaPatch(file, '#save-btn', '#save-btn-fixed');
    expect(readFileSync(file, 'utf8')).toBe(`page.locator("#save-btn-fixed").click();`);
    expect(patch.before).not.toBe(patch.after);
  });

  it('patches a private final String constant field declaration', () => {
    const file = `${dir}/LoginPage.java`;
    writeFileSync(
      file,
      `public class LoginPage {\n  private final String saveBtn = "#save-btn";\n  void clickSave() { page.locator(saveBtn).click(); }\n}`,
    );
    applyJavaPatch(file, '#save-btn', '#save-btn-fixed');
    const content = readFileSync(file, 'utf8');
    expect(content).toContain('private final String saveBtn = "#save-btn-fixed";');
  });

  it('patches a constant inherited from a base class — found via project-wide search, not Java-specific logic', () => {
    const basePage = `${dir}/BasePage.java`;
    const loginTest = `${dir}/LoginTest.java`;
    writeFileSync(basePage, `public class BasePage {\n  protected final String saveBtn = "#inherited-save-btn";\n}`);
    writeFileSync(
      loginTest,
      `public class LoginTest extends BasePage {\n  void test() { page.locator(saveBtn).click(); }\n}`,
    );
    // The literal only appears in BasePage.java — resolvePatch (shared,
    // language-agnostic) finds it there even though the failing test class is
    // LoginTest.java, exactly like the TS Page Object Model case (Task 53).
    const resolution = resolvePatch(dir, '#inherited-save-btn');
    expect(resolution.action).toBe('patch');
    expect(resolution.occurrences[0].file).toContain('BasePage.java');

    applyJavaPatch(`${dir}/${resolution.occurrences[0].file}`, '#inherited-save-btn', '#inherited-save-btn-fixed');
    expect(readFileSync(basePage, 'utf8')).toContain('#inherited-save-btn-fixed');
  });

  it('declines a dynamically constructed selector — resolvePatch finds zero occurrences, applyJavaPatch is never reached', () => {
    const file = `${dir}/DataGrid.java`;
    writeFileSync(file, `String selector = "#row-" + rowId;\npage.locator(selector).click();`);
    // The broken selector as it appeared at runtime, e.g. "#row-5" — never
    // present as source TEXT, since it's built by concatenation.
    const resolution = resolvePatch(dir, '#row-5');
    expect(resolution.action).toBe('decline');
    expect(resolution.reason).toContain('dynamically constructed');
  });
});
