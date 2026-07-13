"use client";

import { useState } from "react";
import { Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  onUnlock,
}: {
  expectedHash: string;
  onUnlock: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecking(true);
    setError(null);
    const hash = await sha256(pin);
    if (hash === expectedHash) {
      onUnlock();
    } else {
      setError("Wrong PIN. Try again.");
      setPin("");
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
        <p className="mb-6 text-sm text-muted-foreground">Enter your PIN to continue</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            autoFocus
            type="password"
            inputMode="numeric"
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN"
            className="h-12 rounded-2xl border border-border/50 bg-muted/40 text-center tracking-[0.5em]"
          />
          {error && <p className="text-center text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={checking || pin.length === 0} className="h-11 w-full rounded-2xl bg-gradient-to-br from-accent to-primary shadow-lg shadow-accent/25 hover:opacity-90">
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Unlock"}
          </Button>
        </form>
      </div>
    </div>
  );
}
