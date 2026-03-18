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

import { useCallback, useRef } from "react";
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
  placeholder = "Write your content...",
  assemblyId,
  minHeight = 200,
}: MarkdownEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown,
      Image.configure({ inline: false, allowBase64: true }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder }),
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
    <div className="tiptap-editor border rounded-lg overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b bg-gray-50">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive("heading", { level: 2 })}
          title="Heading"
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive("heading", { level: 3 })}
          title="Subheading"
        >
          H3
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Bold"
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Italic"
        >
          <em>I</em>
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Bullet list"
        >
          &bull; List
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Numbered list"
        >
          1. List
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive("blockquote")}
          title="Quote"
        >
          &ldquo; Quote
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Divider"
        >
          &mdash;
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton onClick={handleImageButton} title="Insert image">
          Image
        </ToolbarButton>
        <ToolbarButton onClick={handleImportButton} title="Import Word or Markdown file">
          Import
        </ToolbarButton>
      </div>

      {/* Editor area */}
      <div
        className="px-4 py-3 focus-within:ring-2 focus-within:ring-blue-100 text-sm text-gray-800"
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
          ? "bg-blue-100 text-blue-700 font-medium"
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      }`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-gray-200 mx-0.5" />;
}
