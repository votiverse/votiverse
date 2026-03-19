/**
 * BulkInvite — CSV file upload for bulk invitations.
 *
 * Two-step flow: upload → preview → confirm.
 */

import { useState, useCallback, useRef } from "react";
import * as api from "../api/client.js";
import type { BulkInvitePreview } from "../api/client.js";
import { Card, CardBody, Button, Badge, ErrorBox } from "./ui.js";

interface BulkInviteProps {
  assemblyId: string;
  onClose: () => void;
}

type Phase = "upload" | "preview" | "sending" | "done";

export function BulkInvite({ assemblyId, onClose }: BulkInviteProps) {
  const [phase, setPhase] = useState<Phase>("upload");
  const [preview, setPreview] = useState<BulkInvitePreview | null>(null);
  const [result, setResult] = useState<api.BulkInviteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (file: File) => {
    setError(null);
    setLoading(true);
    try {
      const csv = await file.text();
      if (!csv.trim()) {
        setError("File is empty");
        return;
      }
      const data = await api.previewBulkInvites(assemblyId, csv);
      setPreview(data);
      setPhase("preview");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to process file");
    } finally {
      setLoading(false);
    }
  }, [assemblyId]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleConfirm = useCallback(async () => {
    if (!preview) return;
    const handles = preview.valid
      .filter((v) => v.status === "found" && !v.alreadyMember)
      .map((v) => v.handle);

    if (handles.length === 0) return;

    setPhase("sending");
    setError(null);
    try {
      const data = await api.createBulkInvites(assemblyId, handles);
      setResult(data);
      setPhase("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send invitations");
      setPhase("preview");
    }
  }, [assemblyId, preview]);

  return (
    <Card className="mb-4">
      <CardBody>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-gray-900 text-sm">Bulk Invite</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">Cancel</button>
        </div>

        {error && <ErrorBox message={error} />}

        {/* Upload phase */}
        {phase === "upload" && (
          <>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center cursor-pointer hover:border-brand-200 transition-colors"
            >
              {loading ? (
                <p className="text-sm text-gray-500">Processing...</p>
              ) : (
                <>
                  <p className="text-sm text-gray-600 mb-1">Drop a CSV file here or click to select</p>
                  <p className="text-xs text-gray-400">One handle per line, or CSV with a "handle" column</p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />
          </>
        )}

        {/* Preview phase */}
        {phase === "preview" && preview && (
          <>
            {/* Summary bar */}
            <div className="flex flex-wrap gap-3 mb-4 text-sm">
              <span className="text-gray-500">
                Total: <span className="font-medium text-gray-900">{preview.summary.total}</span>
              </span>
              {preview.summary.canInvite > 0 && (
                <Badge color="green">{preview.summary.canInvite} can be invited</Badge>
              )}
              {preview.summary.alreadyMembers > 0 && (
                <Badge color="yellow">{preview.summary.alreadyMembers} already members</Badge>
              )}
              {preview.summary.unknownHandles > 0 && (
                <Badge color="gray">{preview.summary.unknownHandles} not found</Badge>
              )}
              {preview.summary.invalidRows > 0 && (
                <Badge color="red">{preview.summary.invalidRows} invalid</Badge>
              )}
            </div>

            {/* Handle list */}
            <div className="max-h-64 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
              {preview.valid.map((v) => (
                <div key={v.handle} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-gray-700 font-mono">@{v.handle}</span>
                  {v.alreadyMember ? (
                    <Badge color="yellow">Already member</Badge>
                  ) : v.status === "not_found" ? (
                    <Badge color="gray">Not found</Badge>
                  ) : (
                    <Badge color="green">Will be invited</Badge>
                  )}
                </div>
              ))}
              {preview.errors.map((e) => (
                <div key={e.row} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-gray-400 font-mono">{e.value}</span>
                  <Badge color="red">{e.reason}</Badge>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="secondary" onClick={() => { setPhase("upload"); setPreview(null); }}>
                Upload different file
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={preview.summary.canInvite === 0}
              >
                Send {preview.summary.canInvite} invitation{preview.summary.canInvite !== 1 ? "s" : ""}
              </Button>
            </div>
          </>
        )}

        {/* Sending phase */}
        {phase === "sending" && (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500">Sending invitations...</p>
          </div>
        )}

        {/* Done phase */}
        {phase === "done" && result && (
          <>
            <div className="text-center py-4">
              <p className="text-sm text-gray-700">
                {result.created} invitation{result.created !== 1 ? "s" : ""} sent
                {result.skipped > 0 && `, ${result.skipped} skipped`}
              </p>
            </div>
            <div className="flex justify-end">
              <Button onClick={onClose}>Done</Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
