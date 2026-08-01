"use client";

import { useState } from "react";
import { Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PatternLock } from "./PatternLock";
import { cn } from "@/lib/utils";

async function sha256(text: string) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export { sha256 };

export function AppLockScreen({
  expectedHash,
  lockType,
  onUnlock,
}: {
  expectedHash: string;
  lockType: "pin" | "password" | "pattern";
  onUnlock: () => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setChecking(true);
    setError(null);
    const hash = await sha256(value);
    if (hash === expectedHash) {
      onUnlock();
    } else {
      setError("Incorrect. Try again.");
      setValue("");
    }
    setChecking(false);
  };

  const handlePatternComplete = async (patternStr: string) => {
    setChecking(true);
    setError(null);
    const hash = await sha256(patternStr);
    if (hash === expectedHash) {
      onUnlock();
    } else {
      setError("Incorrect pattern.");
      setValue("");
    }
    setChecking(false);
  };

  return (
    <div className="app-grid-lines fixed inset-0 z-[200] flex flex-col items-center justify-center bg-background px-8">
      <div className="app-surface w-full max-w-xs rounded-[32px] p-8 text-center">
        <div className="app-hero mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[24px] text-accent">
          <Lock className="h-8 w-8" />
        </div>
        <h1 className="text-gradient-brand mb-1 text-xl font-bold font-headline">App Locked</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {lockType === "pin" && "Enter your PIN to continue"}
          {lockType === "password" && "Enter your Password to continue"}
          {lockType === "pattern" && "Draw your Pattern to continue"}
        </p>
        
        {lockType === "pattern" ? (
          <div className="flex flex-col items-center">
            <PatternLock onComplete={handlePatternComplete} error={!!error} />
            {error && <p className="mt-4 text-center text-sm text-destructive">{error}</p>}
            {checking && <Loader2 className="mt-4 h-6 w-6 animate-spin text-accent" />}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              autoFocus
              type={lockType === "pin" ? "password" : "password"}
              inputMode={lockType === "pin" ? "numeric" : "text"}
              maxLength={lockType === "pin" ? 8 : 64}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={lockType === "pin" ? "PIN" : "Password"}
              className={cn(
                "h-12 rounded-2xl border border-border/50 bg-muted/40 text-center",
                lockType === "pin" && "tracking-[0.5em]"
              )}
            />
            {error && <p className="text-center text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={checking || value.length === 0} className="h-11 w-full rounded-2xl bg-gradient-to-br from-accent to-primary shadow-lg shadow-accent/25 hover:opacity-90">
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Unlock"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
