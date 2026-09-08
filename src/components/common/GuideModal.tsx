import { X } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { CODING_CLI_INFO } from "../../lib/codingCli";
import { useSettingsStore } from "../../stores/settingsStore";

interface GuideModalProps {
  open: boolean;
  onClose: () => void;
}

export function GuideModal({ open, onClose }: GuideModalProps) {
  const { t } = useI18n();
  const codingCli = useSettingsStore((s) => s.codingCli);
  const cli = CODING_CLI_INFO[codingCli];

  if (!open) return null;

  return (
    <div className="guide-overlay" onClick={onClose}>
      <div className="guide-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="guide-dialog__header">
          <span className="guide-dialog__title">{t("cli.guide.title")}</span>
          <button className="btn btn--ghost btn--sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="guide-dialog__body">
          <section className="guide-section">
            <h2 className="guide-section__title">{t("cli.guide.sessions")}</h2>
            <p>{t("cli.guide.selected").replace("{cli}", cli.label)}</p>
            <p>{t("cli.guide.projectDirectory")}</p>
            <h3 className="guide-section__subtitle">{t("cli.guide.new")}</h3>
            <pre className="guide-pre">{codingCli}</pre>
            <p>{t("cli.guide.newHint")}</p>
            <h3 className="guide-section__subtitle">{t("cli.guide.continue")}</h3>
            <pre className="guide-pre">{`${codingCli} --continue`}</pre>
            <p>{t("cli.guide.continueHint")}</p>
            <h3 className="guide-section__subtitle">{t("cli.guide.resume")}</h3>
            <pre className="guide-pre">{`${codingCli} --resume`}</pre>
            <p>{t("cli.guide.resumeHint")}</p>
            <div className="guide-tip">{t("cli.guide.separateSessions")}</div>
          </section>

          <section className="guide-section">
            <h2 className="guide-section__title">{t("cli.guide.models")}</h2>
            <p>{t("cli.setupSubtitle")}</p>
            <pre className="guide-pre">{"/login\n/model"}</pre>
            <p>{t("cli.guide.modelCommands")}</p>
            <p>{t("cli.setupPreservation")}</p>
          </section>

          <section className="guide-section">
            <h2 className="guide-section__title">{t("cli.guide.rules")}</h2>
            <p>{t("cli.guide.rulesHint")}</p>
            <pre className="guide-pre">AGENTS.md</pre>
            <p>{t("cli.guide.rulesContent")}</p>
            <p>{t("cli.guide.rulesCompatibility")}</p>
            <div className="guide-tip">{t("cli.guide.memoryScope")}</div>
          </section>

          <section className="guide-section">
            <h2 className="guide-section__title">{t("cli.guide.approval")}</h2>
            <p>{t(cli.supportsApproval ? "cli.guide.ompApproval" : "cli.guide.piApproval")}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
