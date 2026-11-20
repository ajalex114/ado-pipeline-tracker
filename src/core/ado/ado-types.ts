/**
 * Minimal shapes for the Azure DevOps REST responses we consume.
 * Only fields the extension actually reads are declared.
 */

export interface AdoBuildResponse {
  id: number;
  buildNumber?: string;
  status?: string; // notStarted | inProgress | completed | cancelling | postponed
  result?: string; // succeeded | partiallySucceeded | failed | canceled | none
  definition?: { name?: string };
  _links?: { web?: { href?: string } };
}

export interface AdoTimelineRecord {
  id: string;
  parentId?: string | null;
  type?: string; // Stage | Phase | Job | Task | Checkpoint ...
  name?: string;
  state?: string; // pending | inProgress | completed
  result?: string | null;
  order?: number;
  /** Stable reference name (e.g. YAML stage id); used by the Stages - Update API. */
  identifier?: string | null;
  attempt?: number;
  task?: { name?: string };
}

export interface AdoTimelineResponse {
  records?: AdoTimelineRecord[];
}
