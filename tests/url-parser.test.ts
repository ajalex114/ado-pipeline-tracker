import { describe, it, expect } from 'vitest';
import {
  parseBuildRunUrl,
  runIdFromRef,
  buildResultsUrl,
} from '../src/core/ado/url-parser';

describe('parseBuildRunUrl', () => {
  it('accepts a dev.azure.com build results URL', () => {
    const result = parseBuildRunUrl(
      'https://dev.azure.com/contoso/MyProject/_build/results?buildId=1234&view=results',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ref.organization).toBe('contoso');
      expect(result.ref.project).toBe('MyProject');
      expect(result.ref.buildId).toBe(1234);
      expect(result.ref.collectionBaseUrl).toBe('https://dev.azure.com/contoso');
    }
  });

  it('accepts a legacy visualstudio.com build URL', () => {
    const result = parseBuildRunUrl(
      'https://contoso.visualstudio.com/MyProject/_build/results?buildId=42',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ref.organization).toBe('contoso');
      expect(result.ref.buildId).toBe(42);
      expect(result.ref.collectionBaseUrl).toBe('https://contoso.visualstudio.com');
    }
  });

  it('decodes URL-encoded project names', () => {
    const result = parseBuildRunUrl(
      'https://dev.azure.com/contoso/My%20Project/_build/results?buildId=7',
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.ref.project).toBe('My Project');
  });

  it('rejects a pipeline definition link (definitionId, no buildId)', () => {
    const result = parseBuildRunUrl(
      'https://dev.azure.com/contoso/MyProject/_build?definitionId=99',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('pipelineDefinitionLink');
  });

  it('rejects a build URL without buildId', () => {
    const result = parseBuildRunUrl('https://dev.azure.com/contoso/MyProject/_build');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('missingBuildId');
  });

  it('rejects non-ADO hosts', () => {
    const result = parseBuildRunUrl('https://github.com/foo/bar/actions/runs/1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('notAdoHost');
  });

  it('rejects malformed URLs', () => {
    const result = parseBuildRunUrl('not a url');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed');
  });

  it('rejects a non-build ADO page', () => {
    const result = parseBuildRunUrl('https://dev.azure.com/contoso/MyProject/_git/repo');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('notBuildUrl');
  });

  it('rejects an invalid (non-positive) buildId', () => {
    const result = parseBuildRunUrl(
      'https://dev.azure.com/contoso/MyProject/_build/results?buildId=0',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('missingBuildId');
  });
});

describe('runIdFromRef / buildResultsUrl', () => {
  const ref = {
    collectionBaseUrl: 'https://dev.azure.com/contoso',
    organization: 'contoso',
    project: 'My Project',
    buildId: 5,
  };

  it('builds a stable id', () => {
    expect(runIdFromRef(ref)).toBe('contoso/My Project/5');
  });

  it('reconstructs a results URL with encoded project', () => {
    expect(buildResultsUrl(ref)).toBe(
      'https://dev.azure.com/contoso/My%20Project/_build/results?buildId=5&view=results',
    );
  });
});
