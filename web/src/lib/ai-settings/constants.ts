export const AI_MODES = ["work_hat_managed", "byo", "disabled"] as const;
export const AI_PROVIDERS = ["openai"] as const;
export const AI_SETTING_STATUSES = ["active", "error", "disabled", "not_configured"] as const;
export const AI_CREDENTIAL_STATUSES = ["active", "error", "disabled"] as const;

export type AIMode = (typeof AI_MODES)[number];
export type AIProvider = (typeof AI_PROVIDERS)[number];
export type AISettingStatus = (typeof AI_SETTING_STATUSES)[number];
export type AICredentialStatus = (typeof AI_CREDENTIAL_STATUSES)[number];

export const SUPPORTED_OPENAI_MODELS = ["gpt-4o", "gpt-4o-mini"] as const;
export type SupportedOpenAIModel = (typeof SUPPORTED_OPENAI_MODELS)[number];

export const DEFAULT_OPENAI_DRAFT_MODEL: SupportedOpenAIModel = "gpt-4o";
