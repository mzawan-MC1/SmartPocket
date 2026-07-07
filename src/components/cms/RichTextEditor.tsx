'use client';

import React, { useMemo, useRef } from 'react';

const EDITOR_ACTIONS = [
  { command: 'bold', label: 'Bold' },
  { command: 'italic', label: 'Italic' },
  { command: 'underline', label: 'Underline' },
  { command: 'insertUnorderedList', label: 'Bullets' },
  { command: 'insertOrderedList', label: 'Numbers' },
  { command: 'formatBlock', label: 'Heading', value: 'h2' },
  { command: 'formatBlock', label: 'Quote', value: 'blockquote' },
];

export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write your page content...',
  containerClassName = '',
  toolbarClassName = '',
  editorClassName = '',
}: {
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
  containerClassName?: string;
  toolbarClassName?: string;
  editorClassName?: string;
}) {
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
}
