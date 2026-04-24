import { friendlyAuthError, safeNext, validateAuthInput } from "@/lib/auth/self-serve";

describe("self-serve auth helpers", () => {
  it("keeps redirects on the Work Hat origin", () => {
    expect(safeNext("/onboarding")).toBe("/onboarding");
    expect(safeNext("/")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/inbox");
    expect(safeNext("https://evil.example")).toBe("/inbox");
    expect(safeNext(null, "/login")).toBe("/login");
  });

  it("validates signup and reset password inputs", () => {
    expect(validateAuthInput({ mode: "signup", email: "", password: "password123", confirmPassword: "password123" }))
      .toBe("Email is required.");
    expect(validateAuthInput({ mode: "signup", email: "user@example.com", password: "short", confirmPassword: "short" }))
      .toBe("Password must be at least 8 characters.");
    expect(validateAuthInput({ mode: "reset", password: "password123", confirmPassword: "different" }))
      .toBe("Passwords do not match.");
    expect(validateAuthInput({ mode: "forgot", email: "user@example.com" })).toBeNull();
  });

  it("translates Supabase auth failures into user-facing messages", () => {
    expect(friendlyAuthError("Invalid login credentials")).toBe("The email or password is incorrect.");
    expect(friendlyAuthError("Email not confirmed")).toBe("Check your email and confirm your account before signing in.");
    expect(friendlyAuthError("User already registered")).toBe("An account already exists for this email. Sign in or reset your password.");
    expect(friendlyAuthError("Token has expired")).toBe("This reset link expired. Request a new password reset email.");
  });
});
