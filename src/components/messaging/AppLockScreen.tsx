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
    <div className="fixed inset-0 z-[200] bg-background flex flex-col items-center justify-center px-8">
      <div className="h-16 w-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
        <Lock className="h-8 w-8 text-accent" />
      </div>
      <h1 className="text-xl font-bold font-headline mb-1">App Locked</h1>
      <p className="text-sm text-muted-foreground mb-6">Enter your PIN to continue</p>
      <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-3">
        <Input
          autoFocus
          type="password"
          inputMode="numeric"
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="PIN"
          className="text-center tracking-[0.5em] rounded-xl h-12 bg-muted/50 border-none"
        />
        {error && <p className="text-sm text-destructive text-center">{error}</p>}
        <Button type="submit" disabled={checking || pin.length === 0} className="w-full h-11 rounded-xl bg-accent hover:bg-accent/90">
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Unlock"}
        </Button>
      </form>
    </div>
  );
}
