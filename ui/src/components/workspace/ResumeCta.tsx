import { useState } from 'react';
import type { ReactElement } from 'react';

import type { SessionRecord } from './api';

export interface ResumeCtaProps {
  readonly record: SessionRecord;
  readonly onResume: () => void;
}

/**
 * Right-pane content when the pinned session record is paused. Shows the
 * record's identity + timestamps and a Resume button — clicking it asks the
 * server to re-spawn the PTY using the adapter's resume semantic (claude
 * --resume <uuid> if we have the hint, otherwise --continue; codex resume
 * --last; shell fresh).
 */
export function ResumeCta(props: ResumeCtaProps): ReactElement {
  const [resuming, setResuming] = useState(false);
  const r = props.record;

  const onClick = (): void => {
    if (resuming) return;
    setResuming(true);
    props.onResume();
    // No setResuming(false) — the parent re-renders once state flips to
    // 'running' which unmounts this component entirely.
  };

  return (
    <div className="resume-cta">
      <div className="resume-cta-header">
        <span className={`resume-cta-badge sidebar-agent-badge is-${r.agent}`}>{prefixOf(r.agent)}</span>
        <span className="resume-cta-name">{r.name}</span>
        <span className="resume-cta-state">paused</span>
      </div>
      <dl className="resume-cta-meta">
        <dt>Agent</dt>
        <dd>{r.agent}</dd>
        <dt>Created</dt>
        <dd>{absoluteTime(r.createdAt)}</dd>
        <dt>Last active</dt>
        <dd>{relativeTime(r.lastActiveAt)}</dd>
        {r.agentSessionId && (
          <>
            <dt>Transcript</dt>
            <dd className="mono">{r.agentSessionId.slice(0, 8)}</dd>
          </>
        )}
      </dl>
      <button
        type="button"
        className="resume-cta-btn"
        onClick={onClick}
        disabled={resuming}
      >
        {resuming ? 'Resuming…' : 'Resume'}
      </button>
      {r.agent === 'shell' && (
        <p className="resume-cta-hint">
          Your previous screen will be restored above the new prompt.
        </p>
      )}
    </div>
  );
}

function prefixOf(agent: string): string {
  if (agent === 'claude') return 'c';
  if (agent === 'codex') return 'x';
  if (agent === 'shell') return 'sh';
  return agent[0] ?? '?';
}

function absoluteTime(iso: string): string {
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return iso;
  return t.toLocaleString();
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const dMs = Date.now() - t;
  if (dMs < 60_000) return 'just now';
  if (dMs < 3_600_000) return `${Math.floor(dMs / 60_000)} min ago`;
  if (dMs < 86_400_000) return `${Math.floor(dMs / 3_600_000)} hours ago`;
  return `${Math.floor(dMs / 86_400_000)} days ago`;
}
