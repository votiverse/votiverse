/**
 * Rich markdown editor powered by TipTap.
 *
 * Features:
 * - WYSIWYG editing with markdown output
 * - Formatting toolbar (headings, bold, italic, lists, links)
 * - Image upload via drag-and-drop or button
 * - Word/DOCX import via mammoth
 * - Read-only markdown renderer mode
 */

import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEditor, EditorContent } from "@tiptap/react";
import "./markdown-editor.css";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import * as mammothLib from "mammoth";

// ---------------------------------------------------------------------------
// Editor component
// ---------------------------------------------------------------------------

interface MarkdownEditorProps {
  /** Initial markdown content. */
  value: string;
  /** Called when content changes — receives markdown string. */
  onChange: (markdown: string) => void;
  /** Placeholder text. */
  placeholder?: string;
  /** Assembly ID for asset uploads. */
  assemblyId?: string;
  /** Minimum editor height in pixels. */
  minHeight?: number;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  assemblyId,
  minHeight = 200,
}: MarkdownEditorProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [linkInputOpen, setLinkInputOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown,
      Image.configure({ inline: false, allowBase64: true }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: placeholder ?? t("editor.placeholder") }),
    ],
    content: value,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(value ? { contentType: "markdown" as any } : {}),
    onUpdate: ({ editor: e }) => {
      try {
        // getMarkdown() is added by the Markdown extension at runtime
        const md = (e as unknown as { getMarkdown(): string }).getMarkdown();
        onChange(md);
      } catch {
        onChange(e.getText());
      }
    },
  });

  const handleImageUpload = useCallback(async (file: File) => {
    if (!editor) return;

    if (assemblyId) {
      // Upload to backend asset store, use the returned URL
      try {
        const formData = new FormData();
        formData.append("file", file);

        const token = (await import("../api/auth.js")).getAccessToken();
        const baseUrl = import.meta.env.VITE_API_BASE_URL || "/api";
        const res = await fetch(`${baseUrl}/assemblies/${assemblyId}/assets`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });

        if (res.ok) {
          const asset = await res.json() as { id: string; filename: string };
          // Use asset:// URI — resolved by the rendering layer
          editor.chain().focus().setImage({ src: `asset://${asset.id}`, alt: asset.filename }).run();
          return;
        }
      } catch {
        // Fall through to base64
      }
    }

    // Fallback: embed as base64
    const reader = new FileReader();
    reader.onload = () => {
      editor.chain().focus().setImage({ src: reader.result as string }).run();
    };
    reader.readAsDataURL(file);
  }, [editor, assemblyId]);

  const handleImageButton = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageUpload(file);
    e.target.value = "";
  }, [handleImageUpload]);

  const handleImportDoc = useCallback(async (file: File) => {
    if (!editor) return;

    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "docx" || ext === "doc") {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammothLib.convertToHtml({ arrayBuffer });
        editor.commands.setContent(result.value);
      } catch (err) {
        console.error("DOCX import failed:", err);
      }
    } else if (ext === "md" || ext === "txt") {
      const text = await file.text();
      editor.commands.setContent(text, { contentType: "markdown" });
    } else {
      console.warn("Unsupported file type:", ext);
    }
  }, [editor]);

  const handleImportButton = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  const handleImportFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImportDoc(file);
    e.target.value = "";
  }, [handleImportDoc]);

  if (!editor) return null;

  return (
    <div className="tiptap-editor border rounded-lg overflow-hidden bg-surface-raised">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b bg-surface">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive("heading", { level: 2 })}
          title={t("editor.heading")}
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive("heading", { level: 3 })}
          title={t("editor.subheading")}
        >
          H3
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title={t("editor.bold")}
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title={t("editor.italic")}
        >
          <em>I</em>
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title={t("editor.bulletList")}
        >
          &bull; {t("editor.list")}
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title={t("editor.numberedList")}
        >
          1. {t("editor.list")}
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive("blockquote")}
          title={t("editor.quote")}
        >
          &ldquo; {t("editor.quote")}
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title={t("editor.divider")}
        >
          &mdash;
        </ToolbarButton>
        <ToolbarButton
          onClick={() => {
            if (editor.isActive("link")) {
              editor.chain().focus().unsetLink().run();
              setLinkInputOpen(false);
            } else {
              setLinkInputOpen(!linkInputOpen);
              setLinkUrl(editor.getAttributes("link").href ?? "");
            }
          }}
          active={editor.isActive("link")}
          title={t("editor.link")}
        >
          {t("editor.link")}
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton onClick={handleImageButton} title={t("editor.insertImage")}>
          {t("editor.image")}
        </ToolbarButton>
        <ToolbarButton onClick={handleImportButton} title={t("editor.importFile")}>
          {t("editor.import")}
        </ToolbarButton>
      </div>

      {/* Inline link input */}
      {linkInputOpen && (
        <div className="flex items-center gap-2 px-2 py-1.5 border-b bg-info-subtle">
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://example.com"
            className="flex-1 text-xs border rounded px-2 py-1 bg-surface-raised"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (linkUrl.trim()) {
                  editor.chain().focus().setLink({ href: linkUrl.trim() }).run();
                }
                setLinkInputOpen(false);
                setLinkUrl("");
              } else if (e.key === "Escape") {
                setLinkInputOpen(false);
                setLinkUrl("");
                editor.chain().focus().run();
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (linkUrl.trim()) {
                editor.chain().focus().setLink({ href: linkUrl.trim() }).run();
              }
              setLinkInputOpen(false);
              setLinkUrl("");
            }}
            className="text-xs text-info-text hover:text-info-text font-medium px-2 py-1"
          >
            {t("apply")}
          </button>
          <button
            type="button"
            onClick={() => { setLinkInputOpen(false); setLinkUrl(""); editor.chain().focus().run(); }}
            className="text-xs text-text-muted hover:text-text-secondary px-2 py-1"
          >
            {t("cancel")}
          </button>
        </div>
      )}

      {/* Editor area */}
      <div
        className="px-4 py-3 focus-within:ring-2 focus-within:ring-focus-ring text-sm text-text-primary"
        style={{ minHeight }}
      >
        <EditorContent editor={editor} />
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelected}
      />
      <input
        ref={importInputRef}
        type="file"
        accept=".docx,.doc,.md,.txt"
        className="hidden"
        onChange={handleImportFileSelected}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Read-only markdown renderer
// ---------------------------------------------------------------------------

interface MarkdownViewerProps {
  /** Markdown content to render. */
  content: string;
}

export function MarkdownViewer({ content }: MarkdownViewerProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown,
      Image.configure({ inline: false }),
      Link.configure({ openOnClick: true }),
    ],
    content,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contentType: "markdown" as any,
    editable: false,
  });

  if (!editor) return null;

  return (
    <div className="tiptap-viewer">
      <EditorContent editor={editor} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar primitives
// ---------------------------------------------------------------------------

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-2 py-1 text-xs rounded transition-colors ${
        active
          ? "bg-accent-subtle text-accent-text font-medium"
          : "text-text-secondary hover:bg-interactive-active hover:text-text-primary"
      }`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-skeleton mx-0.5" />;
}
