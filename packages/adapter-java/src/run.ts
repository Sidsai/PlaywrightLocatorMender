import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { BuildTool } from './detect.js';
import type { TestIdentity } from '../../trace/src/events.js';
import type { TestResult } from '../../core/src/patch/adapter.js';

const execFileAsync = promisify(execFile);

export interface RunCommand {
  cmd: string;
  args: string[];
}

/**
 * Builds the run command for one of TRD §8's three shapes:
 *   Maven + JUnit/TestNG:  mvn test -Dtest=Class#method
 *   Gradle + JUnit/TestNG: gradle test --tests Class.method
 *   Cucumber:              mvn test -Dcucumber.filter.name="<scenario>"
 *
 * `identity.raw` is "Class#method" for JUnit/TestNG (D-008/D-016's precedence
 * chain resolves to exactly this shape) or a free-form scenario name for
 * Cucumber — the caller (Task 62) determines which via cucumberScenario.
 */
export function buildRunCommand(buildTool: BuildTool, identity: TestIdentity, cucumberScenario = false): RunCommand {
  // -DfailIfNoTests=true: Maven Surefire's default behaviour when a -Dtest/
  // cucumber.filter.name filter matches ZERO tests is BUILD SUCCESS with
  // "Tests run: 0" — confirmed directly against the real fixtures/java-suite
  // project while writing this task's test (see AI/DECISION.md D-028). Without
  // this flag, a misresolved test identity (a typo, a stale filename-convention
  // guess, D-008's fallback tiers producing a slightly wrong Class#method) would
  // make the verifier (Task 56) report a FALSE POSITIVE "verified" for a repair
  // that was never actually tested at all — the single worst outcome this whole
  // project exists to prevent (PRD P2: the dangerous failure is a confident
  // wrong one). Gradle's --tests has the equivalent behaviour built in by
  // default (a non-matching filter fails the build), so no extra flag there.
  if (cucumberScenario) {
    return { cmd: 'mvn', args: ['test', `-Dcucumber.filter.name=${identity.raw}`, '-DfailIfNoTests=true'] };
  }
  if (buildTool === 'maven') {
    return { cmd: 'mvn', args: ['test', `-Dtest=${identity.raw}`, '-DfailIfNoTests=true'] };
  }
  // Gradle wants Class.method (dot), while identity.raw is Class#method (hash) —
  // the TRD §8 shapes differ in this one punctuation detail between build tools.
  return { cmd: 'gradle', args: ['test', '--tests', identity.raw.replace('#', '.')] };
}

// Same lesson as the TypeScript adapter (D-027): npm/other CLI shims need
// shell:true to spawn on Windows, and mvn/gradle are no different — both are
// typically .cmd/.bat wrappers on a Windows PATH.
export async function runJavaTest(buildTool: BuildTool, identity: TestIdentity, cwd: string, cucumberScenario = false): Promise<TestResult> {
  const { cmd, args } = buildRunCommand(buildTool, identity, cucumberScenario);
  const start = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, { cwd, shell: true });
    return { passed: true, output: stdout + stderr, durationMs: Date.now() - start };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message: string };
    return { passed: false, output: (err.stdout ?? '') + (err.stderr ?? err.message), durationMs: Date.now() - start };
  }
}
