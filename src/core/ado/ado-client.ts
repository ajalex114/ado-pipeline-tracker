import type { Logger } from '@core/logging/logger';
import type { BuildRunRef } from '@shared/types';
import type { AdoBuildResponse, AdoTimelineResponse } from './ado-types';

const API_VERSION = '7.1';

/** Discriminated result so callers can distinguish auth vs transient errors. */
export type AdoFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: AdoErrorKind; status?: number; message: string };

export type AdoErrorKind = 'auth' | 'notFound' | 'network' | 'server' | 'unknown';

/**
 * Thin Azure DevOps REST client.
 *
 * Authentication: relies on the user's existing signed-in browser session by
 * sending requests with `credentials: 'include'` (interview decision Q3). The
 * extension never stores or transmits tokens itself, so no secrets are logged.
 *
 * The client is dependency-injected with a `fetch` implementation to keep it
 * unit-testable (Dependency Inversion).
 */
export class AdoClient {
  constructor(
    private readonly logger: Logger,
    private readonly fetchFn: typeof fetch = fetch.bind(globalThis),
  ) {}

  async getBuild(ref: BuildRunRef): Promise<AdoFetchResult<AdoBuildResponse>> {
    const url = `${ref.collectionBaseUrl}/${encodeURIComponent(ref.project)}/_apis/build/builds/${ref.buildId}?api-version=${API_VERSION}`;
    return this.getJson<AdoBuildResponse>(url, 'getBuild', ref.buildId);
  }

  async getTimeline(ref: BuildRunRef): Promise<AdoFetchResult<AdoTimelineResponse>> {
    const url = `${ref.collectionBaseUrl}/${encodeURIComponent(ref.project)}/_apis/build/builds/${ref.buildId}/timeline?api-version=${API_VERSION}`;
    return this.getJson<AdoTimelineResponse>(url, 'getTimeline', ref.buildId);
  }

  /**
   * Equivalent of ADO's "Rerun failed jobs": retries every failed/canceled job
   * of a completed build. ADO has no task-level rerun; jobs are the finest unit.
   */
  async retryBuild(ref: BuildRunRef): Promise<AdoFetchResult<AdoBuildResponse>> {
    const url = `${ref.collectionBaseUrl}/${encodeURIComponent(ref.project)}/_apis/build/builds/${ref.buildId}?retry=true&api-version=${API_VERSION}`;
    return this.request<AdoBuildResponse>(url, 'retryBuild', ref.buildId, 'PATCH', {});
  }

  /** Retries only the failed jobs of a single stage (YAML multi-stage pipelines). */
  async retryStage(ref: BuildRunRef, stageRefName: string): Promise<AdoFetchResult<unknown>> {
    const url = `${ref.collectionBaseUrl}/${encodeURIComponent(ref.project)}/_apis/build/builds/${ref.buildId}/stages/${encodeURIComponent(stageRefName)}?api-version=${API_VERSION}`;
    return this.request<unknown>(url, 'retryStage', ref.buildId, 'PATCH', {
      state: 'retry',
      forceRetryAllJobs: false,
      retryDependencies: true,
    });
  }

  private getJson<T>(url: string, op: string, buildId: number): Promise<AdoFetchResult<T>> {
    return this.request<T>(url, op, buildId, 'GET');
  }

  private async request<T>(
    url: string,
    op: string,
    buildId: number,
    method: 'GET' | 'PATCH',
    body?: unknown,
  ): Promise<AdoFetchResult<T>> {
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        // Ask ADO for a 401 instead of an HTML sign-in redirect.
        'X-TFS-FedAuthRedirect': 'Suppress',
      };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const response = await this.fetchFn(url, {
        method,
        credentials: 'include',
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const kind = classifyStatus(response.status);
        this.logger.warn('ADO request failed', { op, buildId, status: response.status, kind });
        return { ok: false, kind, status: response.status, message: describeStatus(response.status) };
      }

      if (response.status === 204) {
        return { ok: true, data: undefined as T };
      }

      // ADO returns an HTML sign-in page (200) when the session is not valid
      // for this collection. Guard against that by checking content type.
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        this.logger.warn('ADO returned non-JSON (likely sign-in required)', { op, buildId });
        return {
          ok: false,
          kind: 'auth',
          message: 'Sign-in required. Open Azure DevOps in this browser and sign in.',
        };
      }

      const data = (await response.json()) as T;
      return { ok: true, data };
    } catch (error) {
      this.logger.error('ADO request threw', { op, buildId, error: toSafeError(error) });
      return { ok: false, kind: 'network', message: 'Network error contacting Azure DevOps.' };
    }
  }
}

function classifyStatus(status: number): AdoErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'notFound';
  if (status >= 500) return 'server';
  return 'unknown';
}

function describeStatus(status: number): string {
  switch (status) {
    case 401:
    case 403:
      return 'You do not have access to this build, or you are not signed in.';
    case 400:
    case 409:
      return 'Azure DevOps rejected the request. The build may not be in a state that allows this action.';
    case 404:
      return 'Build not found. It may have been deleted.';
    default:
      return `Azure DevOps returned an error (HTTP ${status}).`;
  }
}

/** Reduces an unknown error to a non-sensitive, loggable string. */
function toSafeError(error: unknown): string {
  if (error instanceof Error) return error.name;
  return 'UnknownError';
}
