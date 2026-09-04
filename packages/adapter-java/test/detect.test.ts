import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { detectBuildTool } from '../src/detect.js';

const dir = 'packages/adapter-java/test/tmp-detect-project';

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('detectBuildTool', () => {
  it('detects Maven from pom.xml', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/pom.xml`, '<project></project>');
    expect(detectBuildTool(dir)).toEqual({ buildTool: 'maven' });
  });

  it('detects Gradle from build.gradle', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/build.gradle`, '');
    expect(detectBuildTool(dir)).toEqual({ buildTool: 'gradle' });
  });

  it('detects Gradle from build.gradle.kts too', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/build.gradle.kts`, '');
    expect(detectBuildTool(dir)).toEqual({ buildTool: 'gradle' });
  });

  it('requires an explicit override when both are present — never guesses', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/pom.xml`, '<project></project>');
    writeFileSync(`${dir}/build.gradle`, '');
    const result = detectBuildTool(dir);
    expect(result.buildTool).toBeUndefined();
    expect(result.error).toContain('ambiguous');
  });

  it('an explicit override wins even when both are present', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/pom.xml`, '<project></project>');
    writeFileSync(`${dir}/build.gradle`, '');
    expect(detectBuildTool(dir, 'gradle')).toEqual({ buildTool: 'gradle' });
  });

  it('a clear error when neither is present', () => {
    mkdirSync(dir, { recursive: true });
    const result = detectBuildTool(dir);
    expect(result.buildTool).toBeUndefined();
    expect(result.error).toBeTruthy();
  });
});
