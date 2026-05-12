import { useMemo } from 'react';
import type { ReactElement } from 'react';

import type { SessionRecord } from './api';
import { FilesPanel } from './FilesPanel';
import { GitPanel } from './GitPanel';
import { ResumeCta } from './ResumeCta';
import { TerminalView, type KeyMap } from './Terminal';

export interface WorkspaceViewProps {
  readonly wsId: string;
  /** Pinned record id, or null = no session pinned (empty pane). */
  readonly sessionId: string | null;
  /** Resolved record matching `sessionId`. null if `sessionId` is null OR the record was just deleted. */
  readonly activeRecord: SessionRecord | null;
  /**
   * All session records for this workspace (running + paused). Running ones
   * get a mounted TerminalView; paused ones don't render slots but appear in
   * the sidebar for resume.
   */
  readonly sessions: readonly SessionRecord[];
  readonly label?: string;
  readonly keyMap?: KeyMap;
  readonly onSpawnFresh: () => void;
  readonly onResume: (sessionId: string) => void;
  readonly onSessionLost: () => void;
}

export function WorkspaceView(props: WorkspaceViewProps): ReactElement {
  // Only running records get a mounted terminal slot. Same persist-across-
  // tab-switch trick from V2.S3 (commit 0f21914): keep them in the DOM,
  // toggle visibility via CSS so switching sessions is a CSS toggle, not a
  // WS reconnect + replay.
  const runningSlots = useMemo<readonly SessionRecord[]>(() => {
    const running = props.sessions.filter((s) => s.state === 'running');
    // Brief race after a fresh spawn: selection.sessionId is set but the
    // optimistic update may have completed *after* render, or the user pinned
    // a session that the next poll hasn't surfaced yet. If the pinned record
    // is running but not in our list, virtually-append so its slot mounts
    // immediately. React reconciles by `key` when the real entry lands.
    if (
      props.sessionId !== null &&
      props.activeRecord !== null &&
      props.activeRecord.state === 'running' &&
      !running.some((s) => s.id === props.sessionId)
    ) {
      return [...running, props.activeRecord];
    }
    return running;
  }, [props.sessions, props.sessionId, props.activeRecord]);

  // Right-pane state machine:
  //  - no selection.sessionId → CTA ("start a new session")
  //  - sessionId but record missing or running-but-still-loading → CTA (the
  //    slot will appear once optimistic / poll lands)
  //  - sessionId + record.state === 'paused' → ResumeCta
  //  - sessionId + record.state === 'running' → active slot among slots
  const showPausedCta =
    props.sessionId !== null &&
    props.activeRecord !== null &&
    props.activeRecord.state === 'paused';
  const showEmptyCta = props.sessionId === null;

  return (
    <div className="workspace-view">
      <div className="workspace-terminal">
        {showEmptyCta && <Cta onSpawn={props.onSpawnFresh} />}
        {showPausedCta && props.activeRecord && (
          <ResumeCta
            record={props.activeRecord}
            onResume={() => props.onResume(props.activeRecord!.id)}
          />
        )}
        {!showPausedCta &&
          runningSlots.map((s) => {
            const isActive = s.id === props.sessionId;
            return (
              <div
                key={s.id}
                className={`workspace-terminal-slot ${isActive ? 'is-active' : 'is-hidden'}`}
              >
                <TerminalView
                  wsId={props.wsId}
                  sessionId={s.id}
                  {...(props.label !== undefined ? { label: `${props.label} · ${s.name}` } : {})}
                  {...(props.keyMap !== undefined ? { keyMap: props.keyMap } : {})}
                  onSessionLost={props.onSessionLost}
                />
              </div>
            );
          })}
      </div>
      <aside className="workspace-side">
        <GitPanel wsId={props.wsId} />
        <FilesPanel wsId={props.wsId} />
      </aside>
    </div>
  );
}

function Cta({ onSpawn }: { onSpawn: () => void }): ReactElement {
  return (
    <div className="workspace-cta">
      <p className="workspace-cta-text">
        No session selected. Pick one from the sidebar, or:
      </p>
      <button type="button" className="workspace-cta-btn" onClick={onSpawn}>
        Start a new session
      </button>
      <p className="workspace-cta-hint">
        <kbd>⌘T</kbd> works too.
      </p>
    </div>
  );
}
