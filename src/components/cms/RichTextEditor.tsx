'use client';

import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';

const EDITOR_ACTIONS = [
  { command: 'bold', label: 'Bold' },
  { command: 'italic', label: 'Italic' },
  { command: 'underline', label: 'Underline' },
  { command: 'insertUnorderedList', label: 'Bullets' },
  { command: 'insertOrderedList', label: 'Numbers' },
  { command: 'formatBlock', label: 'Heading', value: 'h2' },
  { command: 'formatBlock', label: 'Quote', value: 'blockquote' },
];

export interface RichTextEditorHandle {
  getEditorElement: () => HTMLDivElement | null;
  insertHtmlAtSelection: (html: string) => { inserted: boolean };
  focus: () => void;
}

const RichTextEditor = forwardRef<
  RichTextEditorHandle,
  {
    value: string;
    onChange: (nextValue: string) => void;
    placeholder?: string;
    containerClassName?: string;
    toolbarClassName?: string;
    editorClassName?: string;
  }
>(function RichTextEditor(
  {
    value,
    onChange,
    placeholder = 'Write your page content...',
    containerClassName = '',
    toolbarClassName = '',
    editorClassName = '',
  },
  ref
) {
  const editorRef = useRef<HTMLDivElement>(null);
  const safeValue = useMemo(() => value || '', [value]);

  const handleAction = (command: string, commandValue?: string) => {
    if (!editorRef.current) {
      return;
    }

    editorRef.current.focus();
    document.execCommand(command, false, commandValue);
    onChange(editorRef.current.innerHTML);
  };

  const insertHtmlAtSelection = useCallback(
    (html: string) => {
      const editor = editorRef.current;
      if (!editor) {
        return { inserted: false };
      }

      editor.focus();
      const selection = window.getSelection();

      if (!selection || selection.rangeCount === 0) {
        editor.insertAdjacentHTML('beforeend', html);
        onChange(editor.innerHTML);
        return { inserted: false };
      }

      let range = selection.getRangeAt(0);
      const editorRange = document.createRange();
      editorRange.selectNodeContents(editor);
      const selectionInside =
        range.compareBoundaryPoints(Range.START_TO_START, editorRange) >= 0 &&
        range.compareBoundaryPoints(Range.END_TO_END, editorRange) <= 0;

      if (!selectionInside) {
        editor.insertAdjacentHTML('beforeend', html);
        onChange(editor.innerHTML);
        return { inserted: false };
      }

      range.deleteContents();
      const temp = document.createElement('div');
      temp.innerHTML = html;
      const nodes = Array.from(temp.childNodes);
      let lastInserted: Node | null = null;
      for (const node of nodes) {
        range.insertNode(node);
        lastInserted = node;
        if (node.parentNode) {
          range.setStartAfter(node);
        }
      }
      if (lastInserted) {
        const newRange = document.createRange();
        newRange.setStartAfter(lastInserted);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
      }

      onChange(editor.innerHTML);
      return { inserted: true };
    },
    [onChange]
  );

  useImperativeHandle(
    ref,
    () => ({
      getEditorElement: () => editorRef.current,
      insertHtmlAtSelection,
      focus: () => editorRef.current?.focus(),
    }),
    [insertHtmlAtSelection]
  );

  return (
    <div className={`rounded-2xl border border-border bg-card ${containerClassName}`.trim()}>
      <div className={`flex flex-wrap items-center gap-2 border-b border-border px-3 py-3 ${toolbarClassName}`.trim()}>
        {EDITOR_ACTIONS.map((action) => (
          <button
            key={`${action.command}-${action.label}`}
            type="button"
            onClick={() => handleAction(action.command, action.value)}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            {action.label}
          </button>
        ))}
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        className={`min-h-[260px] px-4 py-4 text-sm text-foreground outline-none [&:empty:before]:text-muted-foreground [&:empty:before]:content-[attr(data-placeholder)] ${editorClassName}`.trim()}
        data-placeholder={placeholder}
        onInput={(event) => onChange((event.currentTarget as HTMLDivElement).innerHTML)}
        dangerouslySetInnerHTML={{ __html: safeValue }}
      />
    </div>
  );
});

export default RichTextEditor;
