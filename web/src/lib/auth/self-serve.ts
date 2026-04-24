export type AuthMode = "signin" | "signup" | "forgot" | "reset";

export type AuthValidationInput = {
  mode: AuthMode;
  email?: string;
  password?: string;
  confirmPassword?: string;
};

/** Only allow same-origin redirect targets; this blocks open-redirect attacks. */
export function safeNext(raw: string | null, fallback = "/inbox"): string {
  if (!raw) return fallback;
  if (/^\/[^/]/.test(raw) || raw === "/") return raw;
  return fallback;
}

export function validateAuthInput({
  mode,
  email = "",
  password = "",
  confirmPassword = "",
}: AuthValidationInput) {
  const needsEmail = mode === "signin" || mode === "signup" || mode === "forgot";
  const needsPassword = mode === "signin" || mode === "signup" || mode === "reset";

  if (needsEmail) {
    if (!email.trim()) return "Email is required.";
    if (!email.includes("@")) return "Enter a valid email address.";
  }

  if (needsPassword) {
    if (!password) return "Password is required.";
    if (password.length < 8) return "Password must be at least 8 characters.";
  }

  if ((mode === "signup" || mode === "reset") && password !== confirmPassword) {
    return "Passwords do not match.";
  }

  return null;
}

export function friendlyAuthError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "The email or password is incorrect.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Check your email and confirm your account before signing in.";
  }
  if (normalized.includes("user already registered") || normalized.includes("already registered")) {
    return "An account already exists for this email. Sign in or reset your password.";
  }
  if (normalized.includes("password should be") || normalized.includes("weak password")) {
    return "Choose a stronger password with at least 8 characters.";
  }
  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "Too many attempts. Wait a moment, then try again.";
  }
  if (normalized.includes("token") && normalized.includes("expired")) {
    return "This reset link expired. Request a new password reset email.";
  }

  return message || "Authentication failed. Please try again.";
}
