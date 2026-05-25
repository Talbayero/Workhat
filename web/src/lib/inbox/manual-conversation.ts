type ManualConversationVisibilityInput = {
  isDemo?: boolean;
  callerRole?: string | null;
  nodeEnv?: string;
};

export function shouldShowManualConversationControl({
  isDemo = false,
  callerRole = null,
  nodeEnv = process.env.NODE_ENV,
}: ManualConversationVisibilityInput = {}) {
  return isDemo || callerRole === "admin" || nodeEnv !== "production";
}
