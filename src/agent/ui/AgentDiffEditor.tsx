import React, { useEffect, useRef } from 'react';
import { Compartment, EditorState, StateField, type Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  keymap,
  type DecorationSet,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { json } from '@codemirror/lang-json';
import { themeSync } from '../../editor/extensions/themeSync';
import { addedRanges, type AgentDiffMode } from './textDiff';

interface AgentDiffEditorProps {
  value: string;
  beforeText: string;
  mode: AgentDiffMode;
  disabled?: boolean;
  onChange: (value: string) => void;
}

function addedDecorations(beforeText: string, mode: AgentDiffMode, docText: string): DecorationSet {
  const marks = addedRanges(beforeText, docText, mode).map(({ from, to }) =>
    Decoration.mark({ class: 'cm-agent-added' }).range(from, to),
  );
  return Decoration.set(marks);
}

const diffTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '12px',
    backgroundColor: 'transparent',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.25rem',
  },
  '.cm-content': {
    padding: '0.5rem 0.75rem',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-agent-added': {
    backgroundColor: 'var(--color-success-soft)',
    color: 'var(--color-success-soft-fg)',
    borderRadius: '2px',
  },
});

/**
 * CodeMirror editor that shows the value being edited with live "added"
 * highlights (green) against the original, so the user can see exactly what
 * will change while they type.
 */
export function AgentDiffEditor({
  value,
  beforeText,
  mode,
  disabled = false,
  onChange,
}: AgentDiffEditorProps): React.ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const beforeTextRef = useRef(beforeText);
  const modeRef = useRef(mode);
  const readOnlyCompartment = useRef(new Compartment());

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    beforeTextRef.current = beforeText;
  }, [beforeText]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const extensions: Extension[] = [
      EditorView.lineWrapping,
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      themeSync(),
      diffTheme,
      readOnlyCompartment.current.of(EditorState.readOnly.of(disabled)),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
      StateField.define<DecorationSet>({
        create(state) {
          return addedDecorations(beforeTextRef.current, modeRef.current, state.doc.toString());
        },
        update(deco, tr) {
          if (!tr.docChanged) return deco;
          return addedDecorations(beforeTextRef.current, modeRef.current, tr.state.doc.toString());
        },
        provide: (field) => EditorView.decorations.from(field),
      }),
    ];
    if (modeRef.current === 'json') {
      extensions.push(json());
    }

    const state = EditorState.create({ doc: value, extensions });
    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    view.focus();
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Mount-time configuration only; live edits flow through the refs above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure(EditorState.readOnly.of(disabled)),
    });
  }, [disabled]);

  return <div ref={hostRef} className="h-full w-full" aria-label="Planned value editor" />;
}
