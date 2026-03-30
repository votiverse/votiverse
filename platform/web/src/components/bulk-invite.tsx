/**
 * BulkInvite — CSV file upload for bulk invitations.
 *
 * Two-step flow: upload → preview → confirm.
 */

import { useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../api/client.js";
import type { BulkInvitePreview } from "../api/client.js";
import { Card, CardBody, Button, Badge, ErrorBox } from "./ui.js";

interface BulkInviteProps {
  groupId: string;
  onClose: () => void;
}

type Phase = "upload" | "preview" | "sending" | "done";

export function BulkInvite({ groupId, onClose }: BulkInviteProps) {
  const { t } = useTranslation("onboarding");
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
        setError(t("bulk.fileEmpty"));
        return;
      }
      const data = await api.previewBulkInvites(groupId, csv);
      setPreview(data);
      setPhase("preview");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("bulk.processError"));
    } finally {
      setLoading(false);
    }
  }, [groupId]);

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
      const data = await api.createBulkInvites(groupId, handles);
      setResult(data);
      setPhase("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("bulk.sendError"));
      setPhase("preview");
    }
  }, [groupId, preview]);

  return (
    <Card className="mb-4">
      <CardBody>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-text-primary text-sm">{t("bulk.title")}</h3>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-secondary text-sm">{t("common:cancel")}</button>
        </div>

        {error && <ErrorBox message={error} />}

        {/* Upload phase */}
        {phase === "upload" && (
          <>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border-default rounded-xl p-8 text-center cursor-pointer hover:border-accent transition-colors"
            >
              {loading ? (
                <p className="text-sm text-text-muted">{t("bulk.processing")}</p>
              ) : (
                <>
                  <p className="text-sm text-text-secondary mb-1">{t("bulk.dropzone")}</p>
                  <p className="text-xs text-text-tertiary">{t("bulk.dropzoneHint")}</p>
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
              <span className="text-text-muted">
                {t("bulk.total")}: <span className="font-medium text-text-primary">{preview.summary.total}</span>
              </span>
              {preview.summary.canInvite > 0 && (
                <Badge color="green">{t("bulk.canInvite", { count: preview.summary.canInvite })}</Badge>
              )}
              {preview.summary.alreadyMembers > 0 && (
                <Badge color="yellow">{t("bulk.alreadyMembers", { count: preview.summary.alreadyMembers })}</Badge>
              )}
              {preview.summary.unknownHandles > 0 && (
                <Badge color="gray">{t("bulk.notFound", { count: preview.summary.unknownHandles })}</Badge>
              )}
              {preview.summary.invalidRows > 0 && (
                <Badge color="red">{t("bulk.invalid", { count: preview.summary.invalidRows })}</Badge>
              )}
            </div>

            {/* Handle list */}
            <div className="max-h-64 overflow-y-auto border border-border-subtle rounded-xl divide-y divide-surface">
              {preview.valid.map((v) => (
                <div key={v.handle} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-text-secondary font-mono">@{v.handle}</span>
                  {v.alreadyMember ? (
                    <Badge color="yellow">{t("bulk.statusAlreadyMember")}</Badge>
                  ) : v.status === "not_found" ? (
                    <Badge color="gray">{t("bulk.statusNotFound")}</Badge>
                  ) : (
                    <Badge color="green">{t("bulk.statusWillInvite")}</Badge>
                  )}
                </div>
              ))}
              {preview.errors.map((e) => (
                <div key={e.row} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-text-tertiary font-mono">{e.value}</span>
                  <Badge color="red">{e.reason}</Badge>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="secondary" onClick={() => { setPhase("upload"); setPreview(null); }}>
                {t("bulk.uploadDifferent")}
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={preview.summary.canInvite === 0}
              >
                {t("bulk.sendInvitations", { count: preview.summary.canInvite })}
              </Button>
            </div>
          </>
        )}

        {/* Sending phase */}
        {phase === "sending" && (
          <div className="text-center py-4">
            <p className="text-sm text-text-muted">{t("bulk.sending")}</p>
          </div>
        )}

        {/* Done phase */}
        {phase === "done" && result && (
          <>
            <div className="text-center py-4">
              <p className="text-sm text-text-secondary">
                {t("bulk.resultSent", { count: result.created })}
                {result.skipped > 0 && `, ${t("bulk.resultSkipped", { count: result.skipped })}`}
              </p>
            </div>
            <div className="flex justify-end">
              <Button onClick={onClose}>{t("bulk.done")}</Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
