import { useId, useState } from "react";
import { CODING_CLI_IDS, CODING_CLI_INFO, type CodingCli, type OmpApprovalMode } from "../../lib/codingCli";
import { useI18n } from "../../lib/i18n";
import { useSettingsStore } from "../../stores/settingsStore";
import { useConfirm } from "./ConfirmDialog";
import { useToast } from "./Toast";

export function CodingCliSettings({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const codingCli = useSettingsStore((state) => state.codingCli);
  const approvalMode = useSettingsStore((state) => state.ompApprovalMode);
  const setCodingCli = useSettingsStore((state) => state.setCodingCli);
  const setApprovalMode = useSettingsStore((state) => state.setOmpApprovalMode);
  const settingsLoading = useSettingsStore((state) => state.loading);
  const [saving, setSaving] = useState(false);
  const id = useId();

  const saveCli = async (cli: CodingCli) => {
    setSaving(true);
    try {
      await setCodingCli(cli);
    } catch (error) {
      toast(`${t("cli.saveFailed")}: ${String(error)}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const saveApproval = async (mode: OmpApprovalMode) => {
    setSaving(true);
    try {
      if (mode === "auto-approve" && approvalMode !== "auto-approve") {
        const accepted = await confirm({
          title: t("cli.autoApproveTitle"),
          message: t("cli.autoApproveWarning"),
          confirmLabel: t("cli.autoApproveConfirm"),
          kind: "warning",
        });
        if (accepted !== true) return;
      }
      await setApprovalMode(mode);
    } catch (error) {
      toast(`${t("cli.saveFailed")}: ${String(error)}`, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`coding-cli-settings${compact ? " coding-cli-settings--compact" : ""}`}>
      <div className="coding-cli-settings__row">
        <label className="coding-cli-settings__label" htmlFor={`${id}-cli`}>{t("cli.selection")}</label>
        <select
          id={`${id}-cli`}
          className="coding-cli-settings__select"
          value={codingCli}
          disabled={saving || settingsLoading}
          onChange={(event) => void saveCli(event.target.value as CodingCli)}
        >
          {CODING_CLI_IDS.map((cli) => <option key={cli} value={cli}>{CODING_CLI_INFO[cli].label}</option>)}
        </select>
      </div>
      {CODING_CLI_INFO[codingCli].supportsApproval ? (
        <div className="coding-cli-settings__row">
          <label className="coding-cli-settings__label" htmlFor={`${id}-approval`}>{t("cli.approval")}</label>
          <select
            id={`${id}-approval`}
            className="coding-cli-settings__select"
            value={approvalMode}
            disabled={saving || settingsLoading}
            aria-describedby={`${id}-hint`}
            onChange={(event) => void saveApproval(event.target.value as OmpApprovalMode)}
          >
            <option value="default">{t("cli.approvalDefault")}</option>
            <option value="always-ask">{t("cli.approvalAlwaysAsk")}</option>
            <option value="auto-approve">{t("cli.approvalAutoApprove")}</option>
          </select>
        </div>
      ) : null}
      <p id={`${id}-hint`} className="coding-cli-settings__hint">
        {t(codingCli === "omp" ? "cli.ompApprovalHint" : "cli.piTrustHint")}
      </p>
    </div>
  );
}
