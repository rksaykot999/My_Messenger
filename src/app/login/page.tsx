"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import { useAuth } from "@/contexts/AuthContext";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircle, Loader2, Globe } from "lucide-react";

export default function LoginPage() {
  const { user, loading, login, signup, loginWithGoogle } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [isPhoneLogin, setIsPhoneLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<any>(null);
  const recaptchaContainer = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/");
    }
  }, [user, loading, router]);

  const setupReCAPTCHA = () => {
    if (!recaptchaContainer.current || (window as any).recaptchaVerifier) return;
    (window as any).recaptchaVerifier = new RecaptchaVerifier(
      recaptchaContainer.current,
      {
        size: "invisible",
        callback: () => {},
      },
      auth
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isPhoneLogin) {
        if (!phone.trim()) throw new Error("Enter a phone number first.");
        setupReCAPTCHA();
        const verifier = (window as any).recaptchaVerifier;
        const confirmation = await signInWithPhoneNumber(auth, phone, verifier);
        setConfirmationResult(confirmation);
      } else {
        if (mode === "login") {
          await login(email, password);
        } else {
          if (!name.trim()) throw new Error("Please enter your name.");
          await signup(name.trim(), email, password);
        }
        router.replace("/");
      }
    } catch (err: any) {
      setError(friendlyAuthError(err?.code || err?.message));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await loginWithGoogle();
      router.replace("/");
    } catch (err: any) {
      setError(friendlyAuthError(err?.code || err?.message));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePhoneVerification = async () => {
    if (!confirmationResult) return;
    setError(null);
    setSubmitting(true);
    try {
      await confirmationResult.confirm(verificationCode);
      router.replace("/");
    } catch (err: any) {
      setError(friendlyAuthError(err?.code || err?.message));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 max-w-md mx-auto">
      <div className="w-full">
        <div className="flex flex-col items-center mb-8">
          <div className="h-16 w-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
            <MessageCircle className="h-8 w-8 text-accent" />
          </div>
          <h1 className="text-2xl font-bold font-headline">My Messenger</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time chat, calls, and more.
          </p>
        </div>

        <Tabs value={mode} onValueChange={(v) => setMode(v as "login" | "signup")}>
          <TabsList className="grid grid-cols-2 w-full mb-6 rounded-xl">
            <TabsTrigger value="login" className="rounded-lg">Log In</TabsTrigger>
            <TabsTrigger value="signup" className="rounded-lg">Sign Up</TabsTrigger>
          </TabsList>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="rounded-xl bg-muted/50 border-none h-11"
                  required
                />
              </div>
            )}

            <div className="flex gap-2 items-center justify-between">
              <h3 className="text-sm font-semibold">Phone login</h3>
              <Button
                type="button"
                variant={isPhoneLogin ? "secondary" : "outline"}
                size="sm"
                onClick={() => setIsPhoneLogin((prev) => !prev)}
              >
                {isPhoneLogin ? "Use email" : "Use phone"}
              </Button>
            </div>

            {isPhoneLogin ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1234567890"
                    className="rounded-xl bg-muted/50 border-none h-11"
                    required
                  />
                </div>
                {confirmationResult && (
                  <div className="space-y-2">
                    <Label htmlFor="code">Verification code</Label>
                    <Input
                      id="code"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      placeholder="123456"
                      className="rounded-xl bg-muted/50 border-none h-11"
                      required
                    />
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="rounded-xl bg-muted/50 border-none h-11"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="rounded-xl bg-muted/50 border-none h-11"
                    minLength={6}
                    required
                  />
                </div>
              </>
            )}

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-11 rounded-xl bg-accent hover:bg-accent/90"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isPhoneLogin ? (
                confirmationResult ? "Verify code" : "Send code"
              ) : mode === "login" ? (
                "Log In"
              ) : (
                "Create Account"
              )}
            </Button>

            <div className="relative py-4">
              <div className="absolute inset-x-0 top-1/2 border-t border-border/50" />
              <p className="relative text-center text-xs text-muted-foreground bg-background px-3">
                or continue with
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={handleGoogleSignIn}
              className="w-full h-11 rounded-xl flex items-center justify-center gap-2"
            >
              <Globe className="h-4 w-4" />
              Continue with Google
            </Button>

            {isPhoneLogin && confirmationResult && (
              <Button
                type="button"
                variant="secondary"
                disabled={submitting || verificationCode.length === 0}
                onClick={handlePhoneVerification}
                className="w-full h-11 rounded-xl"
              >
                Verify Phone Code
              </Button>
            )}
          </form>
        </Tabs>
      </div>
    </div>
  );
}

function friendlyAuthError(code?: string) {
  switch (code) {
    case "auth/invalid-email":
      return "That email address doesn't look right.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    case "auth/email-already-in-use":
      return "An account already exists with that email.";
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    case "auth/configuration-not-found":
    case "auth/invalid-api-key":
      return "Firebase isn't configured yet. Add your project keys to .env.local.";
    case "auth/invalid-phone-number":
      return "That phone number is invalid. Use E.164 format like +1234567890.";
    case "auth/missing-phone-number":
      return "Please enter your phone number.";
    case "auth/quota-exceeded":
      return "Too many requests. Try again later.";
    case "auth/invalid-verification-code":
      return "Wrong verification code. Please check and try again.";
    case "auth/code-expired":
      return "The verification code has expired. Request a new one.";
    default:
      return code || "Something went wrong. Please try again.";
  }
}
