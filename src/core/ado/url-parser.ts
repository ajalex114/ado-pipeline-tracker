import type { BuildRunRef } from '@shared/types';

/**
 * Parses and validates Azure DevOps build-RUN URLs.
 *
 * Behavior contract (docs/behavior.md §1, spec §6.1):
 *  - Accept only run-level URLs that identify a single build (buildId present).
 *  - Reject pipeline-definition URLs (definitionId without buildId) to keep
 *    tracking explicit and low-noise.
 *
 * Supported URL shapes:
 *  - https://dev.azure.com/{org}/{project}/_build/results?buildId=123
 *  - https://{org}.visualstudio.com/{project}/_build/results?buildId=123
 *  - Project segment may be a name or a GUID.
 */

export type ParseResult =
  | { ok: true; ref: BuildRunRef }
  | { ok: false; reason: ParseFailureReason; message: string };

export type ParseFailureReason =
  | 'notAdoHost'
  | 'notBuildUrl'
  | 'pipelineDefinitionLink'
  | 'missingBuildId'
  | 'malformed';

function isAdoHost(host: string): 'dev' | 'vsts' | null {
  if (host === 'dev.azure.com') return 'dev';
  if (host.endsWith('.visualstudio.com')) return 'vsts';
  return null;
}

/**
 * @param rawUrl A candidate URL string (from a tab, paste, or content script).
 */
export function parseBuildRunUrl(rawUrl: string): ParseResult {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return { ok: false, reason: 'malformed', message: 'The value is not a valid URL.' };
  }

  const hostKind = isAdoHost(url.hostname);
  if (!hostKind) {
    return {
      ok: false,
      reason: 'notAdoHost',
      message: 'Only Azure DevOps (dev.azure.com or *.visualstudio.com) URLs are supported.',
    };
  }

  // Path segments differ between the two host styles.
  const segments = url.pathname.split('/').filter(Boolean);

  let organization: string;
  let project: string;
  let collectionBaseUrl: string;

  if (hostKind === 'dev') {
    // /{org}/{project}/_build/results
    if (segments.length < 2) {
      return { ok: false, reason: 'malformed', message: 'URL is missing organization or project.' };
    }
    organization = decodeURIComponent(segments[0]);
    project = decodeURIComponent(segments[1]);
    collectionBaseUrl = `https://dev.azure.com/${segments[0]}`;
  } else {
    // https://{org}.visualstudio.com/{project}/_build/results
    organization = url.hostname.split('.')[0];
    if (segments.length < 1) {
      return { ok: false, reason: 'malformed', message: 'URL is missing project.' };
    }
    project = decodeURIComponent(segments[0]);
    collectionBaseUrl = `https://${url.hostname}`;
  }

  const lowerPath = url.pathname.toLowerCase();
  if (!lowerPath.includes('/_build')) {
    return {
      ok: false,
      reason: 'notBuildUrl',
      message: 'This is not an Azure DevOps build URL.',
    };
  }

  const buildIdRaw = url.searchParams.get('buildId');
  const definitionId = url.searchParams.get('definitionId');

  if (!buildIdRaw) {
    // A pipeline link points at a definition, not a specific run.
    if (definitionId) {
      return {
        ok: false,
        reason: 'pipelineDefinitionLink',
        message:
          'This is a pipeline link. Please open a specific build run and use its URL (it contains buildId=...).',
      };
    }
    return {
      ok: false,
      reason: 'missingBuildId',
      message: 'The URL does not reference a specific build run (missing buildId).',
    };
  }

  const buildId = Number.parseInt(buildIdRaw, 10);
  if (!Number.isInteger(buildId) || buildId <= 0) {
    return {
      ok: false,
      reason: 'missingBuildId',
      message: 'The buildId in the URL is not valid.',
    };
  }

  return {
    ok: true,
    ref: { collectionBaseUrl, organization, project, buildId },
  };
}

/** Builds the canonical stable id for a run reference. */
export function runIdFromRef(ref: BuildRunRef): string {
  return `${ref.organization}/${ref.project}/${ref.buildId}`;
}

/** Reconstructs a user-facing build results URL from a reference. */
export function buildResultsUrl(ref: BuildRunRef): string {
  return `${ref.collectionBaseUrl}/${encodeURIComponent(ref.project)}/_build/results?buildId=${ref.buildId}&view=results`;
}
