export type CodingCli = "omp" | "pi";
export type CliLaunchAction = "new" | "continue" | "resume";
export type OmpApprovalMode = "default" | "always-ask" | "auto-approve";

export const CODING_CLI_IDS: readonly CodingCli[] = ["omp", "pi"];

export const CODING_CLI_INFO: Record<CodingCli, { label: string; supportsApproval: boolean }> = {
  omp: { label: "OMP", supportsApproval: true },
  pi: { label: "Pi", supportsApproval: false },
};
