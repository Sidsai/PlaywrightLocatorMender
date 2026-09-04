import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { buildRunCommand, runJavaTest, isCucumberScenario } from '../src/run.js';

function hasGradle(): boolean {
  try {
    execSync('gradle --version', { stdio: 'ignore', shell: true as unknown as string });
    return true;
  } catch {
    return false;
  }
}

const identity = { raw: 'DriftTest#savesTheForm', source: 'title' as const };

describe('buildRunCommand — TRD §8 command shapes', () => {
  it('Maven + JUnit/TestNG: mvn test -Dtest=Class#method -DfailIfNoTests=true', () => {
    // failIfNoTests is required, not decorative — Maven's default silently
    // reports BUILD SUCCESS for a filter that matches zero tests (D-028),
    // confirmed against the real fixtures/java-suite project.
    expect(buildRunCommand('maven', identity)).toEqual({
      cmd: 'mvn',
      args: ['test', '-Dtest=DriftTest#savesTheForm', '-DfailIfNoTests=true'],
    });
  });

  it('Gradle + JUnit/TestNG: gradle test --tests Class.method (dot, not hash)', () => {
    expect(buildRunCommand('gradle', identity)).toEqual({
      cmd: 'gradle',
      args: ['test', '--tests', 'DriftTest.savesTheForm'],
    });
  });

  it('Cucumber: mvn test -Dcucumber.filter.name="<scenario>" -DfailIfNoTests=true', () => {
    const scenario = { raw: 'User saves the form', source: 'title' as const };
    expect(buildRunCommand('maven', scenario, true)).toEqual({
      cmd: 'mvn',
      args: ['test', '-Dcucumber.filter.name=User saves the form', '-DfailIfNoTests=true'],
    });
  });
});

describe('isCucumberScenario — distinguishing scenario names from Class#method (Task 62)', () => {
  it('a Class#method identity is NOT a Cucumber scenario', () => {
    expect(isCucumberScenario({ raw: 'DriftTest#savesTheForm', source: 'title' })).toBe(false);
  });

  it('a free-form scenario sentence IS a Cucumber scenario', () => {
    expect(isCucumberScenario({ raw: 'User saves the form', source: 'title' })).toBe(true);
  });

  it('a scenario name resolves to the cucumber.filter.name command shape automatically via runJavaTest', () => {
    const cmd = buildRunCommand('maven', { raw: 'User saves the form', source: 'title' }, true);
    expect(cmd.args).toContain('-Dcucumber.filter.name=User saves the form');
  });
});

describe('runJavaTest — real subprocess execution', () => {
  it('a nonexistent method name FAILS via a real Maven invocation — not a silent zero-tests success (D-028)', async () => {
    // Proves two things at once, both found only by running the real
    // subprocess rather than mocking it: (1) the subprocess spawns correctly
    // on Windows (shell:true, same lesson as D-027); (2) -DfailIfNoTests=true
    // is actually taking effect — without it, this exact call returns
    // passed:true with "Tests run: 0" (confirmed directly against the real
    // fixtures/java-suite project, see D-028), which would make the verifier
    // report a false positive for a broken test identity.
    const result = await runJavaTest(
      'maven',
      { raw: 'DriftTest#thisMethodDoesNotExist', source: 'title' },
      'fixtures/java-suite',
    );
    expect(result.passed).toBe(false);
    expect(result.output).not.toContain('ENOENT');
    expect(result.output).toMatch(/No tests were executed|BUILD FAILURE/);
  }, 120_000);

  // Gradle is not installed on this development machine (confirmed during
  // planning — D-013). This test is written and committed so CI (which does
  // have Gradle, Task 64) exercises it for real, but is skipped here rather
  // than producing a false failure from a missing tool.
  it.skipIf(!hasGradle())('runs a real Gradle command (CI-only, D-013)', async () => {
    const result = await runJavaTest('gradle', { raw: 'X#nonexistent', source: 'title' }, 'fixtures/java-suite');
    expect(result.passed).toBe(false);
  }, 120_000);
});
