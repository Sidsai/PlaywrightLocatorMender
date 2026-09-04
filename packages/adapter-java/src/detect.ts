import { existsSync } from 'node:fs';
import { join } from 'node:path';

export type BuildTool = 'maven' | 'gradle';

export interface DetectionResult {
  buildTool?: BuildTool;
  error?: string;
}

/**
 * Detects Maven vs Gradle by reading for pom.xml / build.gradle (or
 * build.gradle.kts) at the project root (TRD §8: "Detection reads pom.xml or
 * build.gradle; a config override exists for projects that defy detection.").
 * Both present is genuinely ambiguous — neither guessed, an explicit override is
 * required. Neither present is a clear, actionable error rather than a silent
 * default.
 */
export function detectBuildTool(projectRoot: string, override?: BuildTool): DetectionResult {
  if (override) return { buildTool: override };

  const hasMaven = existsSync(join(projectRoot, 'pom.xml'));
  const hasGradle =
    existsSync(join(projectRoot, 'build.gradle')) || existsSync(join(projectRoot, 'build.gradle.kts'));

  if (hasMaven && hasGradle) {
    return {
      error:
        'both pom.xml and build.gradle found — ambiguous, set buildTool explicitly in mender.config.json',
    };
  }
  if (hasMaven) return { buildTool: 'maven' };
  if (hasGradle) return { buildTool: 'gradle' };

  return { error: 'neither pom.xml nor build.gradle found at the project root — cannot detect build tool' };
}
