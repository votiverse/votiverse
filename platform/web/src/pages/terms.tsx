import { useTranslation } from "react-i18next";
import { Card, CardBody } from "../components/ui.js";

export function TermsPage() {
  const { t } = useTranslation("governance");

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-bold font-display text-text-primary mb-6">{t("terms.title")}</h1>

      <Card>
        <CardBody className="prose prose-sm text-text-secondary max-w-none">
          <h2 className="text-base font-semibold text-text-primary">{t("terms.acceptanceTitle")}</h2>
          <p>{t("terms.acceptanceText")}</p>

          <h2 className="text-base font-semibold text-text-primary">{t("terms.useTitle")}</h2>
          <p>{t("terms.useText")}</p>

          <h2 className="text-base font-semibold text-text-primary">{t("terms.accountsTitle")}</h2>
          <p>{t("terms.accountsText")}</p>

          <h2 className="text-base font-semibold text-text-primary">{t("terms.contentTitle")}</h2>
          <p>{t("terms.contentText")}</p>

          <h2 className="text-base font-semibold text-text-primary">{t("terms.privacyTitle")}</h2>
          <p>{t("terms.privacyText")}</p>

          <h2 className="text-base font-semibold text-text-primary">{t("terms.changesTitle")}</h2>
          <p>{t("terms.changesText")}</p>

          <h2 className="text-base font-semibold text-text-primary">{t("terms.contactTitle")}</h2>
          <p>{t("terms.contactText")}</p>
        </CardBody>
      </Card>
    </div>
  );
}
