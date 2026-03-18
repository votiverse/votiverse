import { useState } from "react";
import { useApi } from "../hooks/use-api.js";
import * as api from "../api/client.js";
import type { CommunityNote } from "../api/types.js";
import { Button, Badge } from "./ui.js";

export function NotesList({ assemblyId, targetType, targetId }: {
  assemblyId: string;
  targetType: string;
  targetId: string;
}) {
  const { data, loading, refetch } = useApi(
    () => api.listNotes(assemblyId, targetType, targetId),
    [assemblyId, targetType, targetId],
  );
  const [showForm, setShowForm] = useState(false);

  const notes = data?.notes ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-gray-700">
          Community Notes {notes.length > 0 && `(${notes.length})`}
        </h4>
        <button
          className="text-sm text-blue-600 hover:text-blue-800"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? "Cancel" : "Add Note"}
        </button>
      </div>

      {showForm && (
        <NoteForm
          assemblyId={assemblyId}
          targetType={targetType}
          targetId={targetId}
          onCreated={() => { setShowForm(false); refetch(); }}
        />
      )}

      {loading && <p className="text-sm text-gray-400">Loading notes...</p>}

      {notes.length === 0 && !loading && (
        <p className="text-sm text-gray-400">No community notes yet.</p>
      )}

      <div className="space-y-2">
        {notes.map((note) => (
          <NoteCard key={note.id} note={note} assemblyId={assemblyId} onEvaluated={refetch} />
        ))}
      </div>
    </div>
  );
}

function NoteCard({ note, assemblyId, onEvaluated }: {
  note: CommunityNote;
  assemblyId: string;
  onEvaluated: () => void;
}) {
  const [evaluating, setEvaluating] = useState(false);

  const handleEvaluate = async (evaluation: "endorse" | "dispute") => {
    setEvaluating(true);
    try {
      await api.evaluateNote(assemblyId, note.id, evaluation);
      onEvaluated();
    } catch (err) {
      // Self-evaluation or other errors
    } finally {
      setEvaluating(false);
    }
  };

  const total = note.endorsementCount + note.disputeCount;
  const ratio = total > 0 ? note.endorsementCount / total : 0;
  const isVisible = note.visibility?.visible;

  return (
    <div className={`border rounded-lg p-3 text-sm ${
      note.status === "withdrawn" ? "bg-gray-50 opacity-60" :
      isVisible ? "bg-green-50 border-green-200" : "bg-white"
    }`}>
      {note.content?.markdown && (
        <p className="text-gray-700 whitespace-pre-wrap">{note.content.markdown}</p>
      )}
      {!note.content?.markdown && (
        <p className="text-gray-400 italic">Note content not available</p>
      )}

      <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
        <span>{note.endorsementCount} helpful</span>
        <span>{note.disputeCount} disputed</span>
        {total > 0 && <span>({Math.round(ratio * 100)}% helpful)</span>}
        {note.status === "withdrawn" && <Badge color="gray">withdrawn</Badge>}
        {isVisible && <Badge color="green">visible</Badge>}
      </div>

      {note.status !== "withdrawn" && (
        <div className="flex gap-2 mt-2">
          <button
            className="text-xs text-green-600 hover:text-green-800 disabled:opacity-50"
            onClick={() => handleEvaluate("endorse")}
            disabled={evaluating}
          >
            Helpful
          </button>
          <button
            className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
            onClick={() => handleEvaluate("dispute")}
            disabled={evaluating}
          >
            Not helpful
          </button>
        </div>
      )}
    </div>
  );
}

function NoteForm({ assemblyId, targetType, targetId, onCreated }: {
  assemblyId: string;
  targetType: string;
  targetId: string;
  onCreated: () => void;
}) {
  const [markdown, setMarkdown] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!markdown.trim()) return;
    setSubmitting(true);
    try {
      await api.createNote(assemblyId, { markdown, targetType, targetId });
      setMarkdown("");
      onCreated();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create note");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mb-4 border rounded-lg p-3 bg-blue-50">
      <textarea
        value={markdown}
        onChange={(e) => setMarkdown(e.target.value)}
        rows={3}
        className="w-full border rounded px-3 py-2 text-sm"
        placeholder="Add context, evidence, or a correction..."
      />
      <div className="mt-2">
        <Button onClick={handleSubmit} disabled={submitting || !markdown.trim()}>
          {submitting ? "Posting..." : "Post Note"}
        </Button>
      </div>
    </div>
  );
}
