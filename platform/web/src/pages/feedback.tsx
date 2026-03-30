import { useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../api/client.js";
import { Card, CardBody, Button, ErrorBox } from "../components/ui.js";

export function FeedbackPage() {
  const { t } = useTranslation("governance");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.submitFeedback(message.trim());
      setSubmitted(true);
      setMessage("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("feedback.error"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary mb-2">{t("feedback.title")}</h1>
      <p className="text-text-muted text-sm mb-6">{t("feedback.subtitle")}</p>

      {submitted ? (
        <Card>
          <CardBody className="text-center py-8">
            <p className="text-lg font-medium text-text-primary mb-2">{t("feedback.thankYou")}</p>
            <p className="text-sm text-text-muted mb-4">{t("feedback.thankYouDesc")}</p>
            <Button onClick={() => setSubmitted(false)}>{t("feedback.sendAnother")}</Button>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <ErrorBox message={error} />}
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t("feedback.placeholder")}
                rows={6}
                maxLength={10000}
                className="w-full rounded-lg border border-border-default bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-muted focus:border-accent-muted resize-y"
                autoFocus
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-tertiary">{message.length}/10,000</span>
                <Button type="submit" disabled={submitting || !message.trim()}>
                  {submitting ? t("feedback.sending") : t("feedback.send")}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
