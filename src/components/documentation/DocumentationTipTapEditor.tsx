'use client';

import React, { forwardRef, useCallback, useImperativeHandle } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import Code from '@tiptap/extension-code';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Code as CodeIcon,
  Heading2,
  Heading3,
  Heading4,
  Undo2,
  Redo2,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';

export interface DocumentationTipTapEditorHandle {
  getEditor: () => Editor | null;
  insertImageAtSelection: (
    src: string,
    alt: string,
    caption?: string | null
  ) => { inserted: boolean };
  focus: () => void;
}

const PLACEHOLDER_TEXT =
  'Write clear documentation… Use headings to separate sections, numbered lists for step-by-step procedures, and insert screenshots where helpful.';

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'border-accent bg-accent/12 text-accent shadow-[inset_0_0_0_1px_rgba(var(--accent-rgb),0.15)]'
          : 'border-border bg-background text-muted-foreground hover:border-border/90 hover:bg-muted/40 hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span className="mx-1.5 inline-block h-6 w-px bg-border/80" aria-hidden="true" />;
}

const DocumentationTipTapEditor = forwardRef<
  DocumentationTipTapEditorHandle,
  {
    value: string;
    onChange: (next: string) => void;
    containerClassName?: string;
    editorClassName?: string;
    placeholder?: string;
  }
>(function DocumentationTipTapEditor(
  {
    value,
    onChange,
    containerClassName = '',
    editorClassName = '',
    placeholder = PLACEHOLDER_TEXT,
  },
  ref
) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3, 4],
        },
        orderedList: {
          HTMLAttributes: {
            class: 'list-decimal',
          },
        },
        bulletList: {
          HTMLAttributes: {
            class: 'list-disc',
          },
        },
        listItem: {
          HTMLAttributes: {},
        },
        codeBlock: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          class: 'text-accent underline underline-offset-2',
        },
      }),
      Image.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: {
          class:
            'mx-auto my-4 block h-auto max-w-full rounded-2xl border border-border/60 shadow-sm',
          loading: 'lazy',
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph', 'image'],
      }),
      Code.configure({
        HTMLAttributes: {
          class:
            'rounded-md border border-border/70 bg-muted/50 px-1.5 py-0.5 font-mono text-[0.85em] text-foreground/90',
        },
      }),
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class: 'outline-none',
        spellcheck: 'true',
      },
      handlePaste: (view, event, slice) => {
        return false;
      },
    },
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());
    },
  });

  React.useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const current = editor.getHTML();
    const next = value || '';
    if (next && current !== next) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [value, editor]);

  const insertImageAtSelection = useCallback<
    DocumentationTipTapEditorHandle['insertImageAtSelection']
  >((src, alt, caption) => {
    if (!editor || editor.isDestroyed) return { inserted: false };
    editor.chain().focus().setImage({ src, alt: alt || '' }).run();
    if (caption && caption.trim()) {
      editor
        .chain()
        .focus()
        .insertContent(
          `<p class="text-center text-sm text-muted-foreground !mt-1 mb-6">${caption
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')}</p>`
        )
        .run();
    }
    return { inserted: true };
  }, [editor]);

  useImperativeHandle(
    ref,
    () => ({
      getEditor: () => editor ?? null,
      insertImageAtSelection,
      focus: () => editor?.chain().focus().run(),
    }),
    [editor, insertImageAtSelection]
  );

  if (!editor) {
    return (
      <div
        className={`rounded-2xl border border-border bg-card min-h-[320px] animate-pulse ${containerClassName}`.trim()}
      />
    );
  }

  const setLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Paste link URL (https://…, /path, mailto:, tel:)', previous || '');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    const cleaned = url.trim();
    const safe =
      /^(https?:|mailto:|tel:|\/)/i.test(cleaned) ? cleaned : `https://${cleaned}`;
    editor.chain().focus().extendMarkRange('link').setLink({ href: safe }).run();
  };

  return (
    <div
      className={`rounded-2xl border border-border bg-card shadow-sm overflow-hidden ${containerClassName}`.trim()}
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/30 px-3 py-2.5">
        <ToolbarButton
          label="Undo"
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 size={14} />
        </ToolbarButton>
        <ToolbarButton
          label="Redo"
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 size={14} />
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton
          label="Heading 2"
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 size={14} />
        </ToolbarButton>
        <ToolbarButton
          label="Heading 3"
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 size={14} />
        </ToolbarButton>
        <ToolbarButton
          label="Heading 4"
          active={editor.isActive('heading', { level: 4 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
        >
          <Heading4 size={14} />
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton
          label="Bold"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={14} />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={14} />
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon size={14} />
        </ToolbarButton>
        <ToolbarButton
          label="Inline code"
          active={editor.isActive('code')}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <CodeIcon size={14} />
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton
          label="Bulleted list"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={14} />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={14} />
        </ToolbarButton>
        <ToolbarButton
          label="Blockquote"
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote size={14} />
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton
          label="Link"
          active={editor.isActive('link')}
          onClick={setLink}
        >
          <LinkIcon size={14} />
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton
          label="Align left"
          active={editor.isActive({ textAlign: 'left' })}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
        >
          <AlignLeft size={14} />
        </ToolbarButton>
        <ToolbarButton
          label="Align center"
          active={editor.isActive({ textAlign: 'center' })}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
        >
          <AlignCenter size={14} />
        </ToolbarButton>
        <ToolbarButton
          label="Align right"
          active={editor.isActive({ textAlign: 'right' })}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
        >
          <AlignRight size={14} />
        </ToolbarButton>
      </div>
      <EditorContent
        editor={editor}
        className={[
          'docs-editor-shell prose prose-slate max-w-none px-5 py-5 text-sm text-foreground',
          'dark:prose-invert',
          '[&_h2]:text-foreground [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-800',
          '[&_h3]:text-foreground [&_h3]:mt-5 [&_h3]:mb-2.5 [&_h3]:text-base [&_h3]:font-700',
          '[&_h4]:text-foreground [&_h4]:mt-4 [&_h4]:mb-2 [&_h4]:text-[0.95rem] [&_h4]:font-700',
          '[&_p]:my-3 [&_p]:leading-7',
          '[&_ul]:my-4 [&_ul]:list-disc [&_ul]:ms-5 [&_ul]:space-y-1.5',
          '[&_ol]:my-4 [&_ol]:list-decimal [&_ol]:ms-5 [&_ol]:space-y-1.5',
          '[&_ul_ul]:mt-1.5 [&_ul_ol]:mt-1.5 [&_ol_ul]:mt-1.5 [&_ol_ol]:mt-1.5',
          '[&_li]:my-0.5 [&_li]:leading-6',
          '[&_blockquote]:my-5 [&_blockquote]:border-l-4 [&_blockquote]:border-accent/50 [&_blockquote]:ms-0 [&_blockquote]:bg-muted/40 [&_blockquote]:rounded-e-xl [&_blockquote]:ps-4 [&_blockquote]:pe-4 [&_blockquote]:py-2.5 [&_blockquote]:text-muted-foreground',
          '[&_blockquote_p:first-child]:mt-1',
          '[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2',
          '[&_img]:mx-auto [&_img]:my-5 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-2xl [&_img]:border [&_img]:border-border/60 [&_img]:shadow-sm',
          '[&_figure]:my-6 [&_figure]:mx-auto [&_figure]:max-w-full [&_figure]:flex [&_figure]:flex-col [&_figure]:items-center [&_figure]:gap-2',
          '[&_figure_img]:my-0 [&_figure_img]:rounded-2xl [&_figure_img]:border [&_figure_img]:border-border/60',
          '[&_figcaption]:text-center [&_figcaption]:text-sm [&_figcaption]:text-muted-foreground',
          editorClassName,
        ]
          .filter(Boolean)
          .join(' ')}
      />
    </div>
  );
});

export default DocumentationTipTapEditor;
