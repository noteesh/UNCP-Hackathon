import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { Activity, Info } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { VoiceAssistantButton } from "../components/voice-assistant-button";
import { useAuth } from "../context/auth-context";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

/** Transcript shown in voice panel; audio comes from GET /voice/instructions?type=landing. */
const LOGIN_PAGE_TRANSCRIPT = `Welcome to AURA, the Advanced Under-eye Response Assessment. This simple test measures cognitive stability through eye movements and voice patterns. Please enable voice guidance for step-by-step instructions. When you're ready, sign in or create an account to continue.`;

type Mode = "login" | "signup";

export function AuthScreen() {
  const navigate = useNavigate();
  const { login, register, loginWithWallet, isAuthenticated } = useAuth();
  const { publicKey, connected, connecting, wallets, select, connect } = useWallet();
  const { setVisible } = useWalletModal();

  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [solanaError, setSolanaError] = useState("");
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  useEffect(() => {
    if (isAuthenticated) navigate("/dashboard");
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (!connected || !publicKey) return;
    setSolanaError("");
    loginWithWallet(publicKey.toBase58());
  }, [connected, publicKey, loginWithWallet]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (mode === "signup") {
      if (!name.trim()) { setError("Please enter your name."); return; }
      if (!email.trim()) { setError("Please enter your email."); return; }
      if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
      if (password !== confirmPassword) { setError("Passwords do not match."); return; }

      setLoading(true);
      const result = await register(email, password, name);
      setLoading(false);
      if (!result.ok) { setError(result.error ?? "Registration failed."); return; }
      navigate("/dashboard");
    } else {
      if (!email.trim() || !password) { setError("Please enter your email and password."); return; }

      setLoading(true);
      const result = await login(email, password);
      setLoading(false);
      if (!result.ok) { setError(result.error ?? "Login failed."); return; }
      navigate("/dashboard");
    }
  };

  const handleSignInWithSolana = async () => {
    setSolanaError("");
    const phantom = wallets.find(
      (w) => w.adapter.name === "Phantom" || String(w.adapter.name).toLowerCase().includes("phantom")
    );
    if (phantom) {
      try {
        select(phantom.adapter.name);
        await connect();
      } catch {
        setSolanaError("Connection failed. Try again or use the wallet list.");
        setVisible(true);
      }
    } else {
      setVisible(true);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError("");
    setName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
  };

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#7c3aed]/10 via-transparent to-[#00d4ff]/10" />
      <div className="absolute top-20 -right-20 w-96 h-96 bg-[#7c3aed]/20 rounded-full blur-3xl" />
      <div className="absolute bottom-20 -left-20 w-96 h-96 bg-[#00d4ff]/20 rounded-full blur-3xl" />

      <div className="max-w-4xl w-full space-y-6 relative z-10">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-[#00d4ff] to-[#7c3aed] p-[2px] mb-4">
            <div className="w-full h-full bg-[#0a0f1e] rounded-2xl flex items-center justify-center">
              <Activity className="w-10 h-10 text-[#00d4ff]" strokeWidth={1.5} />
            </div>
          </div>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-[#00d4ff] to-[#7c3aed] bg-clip-text text-transparent">
            AURA
          </h1>
          <div className="w-full max-w-md mx-auto mt-3 flex justify-center">
            <div
              className="h-0.5 w-full max-w-[85%] rounded-full"
              style={{
                background: "linear-gradient(90deg, transparent 0%, rgba(0,212,255,0.95) 12%, #00d4ff 25%, #7c3aed 50%, #00d4ff 75%, rgba(0,212,255,0.95) 88%, transparent 100%)",
                boxShadow: "0 0 16px rgba(0,212,255,0.7), 0 0 32px rgba(124,58,237,0.5)",
              }}
            />
          </div>
          <p className="text-lg text-white/80">Advanced Under-eye Response Assessment</p>
          <p className="text-sm text-white/60 max-w-xl mx-auto">
            {mode === "login" ? "Sign in to continue your assessment" : "Create an account to get started"}
          </p>
        </div>

        {/* Login / Sign Up toggle */}
        <div className="max-w-md mx-auto flex rounded-xl overflow-hidden border border-white/10 bg-white/5">
          <button
            type="button"
            onClick={() => switchMode("login")}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
              mode === "login" ? "bg-[#00d4ff] text-[#0a0f1e]" : "text-white/60 hover:text-white"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => switchMode("signup")}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
              mode === "signup" ? "bg-[#7c3aed] text-white" : "text-white/60 hover:text-white"
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Form */}
        <div className="max-w-md mx-auto space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-white/90 mb-1.5">
                  Full Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Smith"
                  autoComplete="name"
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/40 focus:border-[#00d4ff] focus:ring-2 focus:ring-[#00d4ff]/20 outline-none transition-all"
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-white/90 mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/40 focus:border-[#00d4ff] focus:ring-2 focus:ring-[#00d4ff]/20 outline-none transition-all"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-white/90 mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/40 focus:border-[#00d4ff] focus:ring-2 focus:ring-[#00d4ff]/20 outline-none transition-all"
              />
            </div>

            {mode === "signup" && (
              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-white/90 mb-1.5">
                  Confirm Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/40 focus:border-[#00d4ff] focus:ring-2 focus:ring-[#00d4ff]/20 outline-none transition-all"
                />
              </div>
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-gradient-to-r from-[#00d4ff] to-[#7c3aed] hover:opacity-90 text-white font-semibold rounded-xl disabled:opacity-50"
            >
              {loading
                ? mode === "login" ? "Signing in…" : "Creating account…"
                : mode === "login" ? "Sign In" : "Create Account"}
            </Button>
          </form>

          <div className="relative flex items-center gap-3 my-4">
            <span className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-white/40">or</span>
            <span className="flex-1 h-px bg-white/10" />
          </div>

          {solanaError && <p className="text-sm text-red-400">{solanaError}</p>}
          <Button
            type="button"
            variant="outline"
            className="w-full h-12 border border-white/20 bg-white/5 text-white hover:bg-white/10 font-semibold rounded-xl"
            disabled={connecting}
            onClick={handleSignInWithSolana}
          >
            {connecting ? "Connecting…" : "Sign in with Solana"}
          </Button>
        </div>

        {/* How It Works */}
        <div className="max-w-md mx-auto">
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowHowItWorks(!showHowItWorks)}
            className="w-full h-12 border border-white/10 bg-white/5 backdrop-blur-xl text-white hover:bg-white/10 text-sm rounded-xl"
          >
            <Info className="mr-2 h-4 w-4" />
            How It Works
          </Button>
        </div>

        {showHowItWorks && (
          <Card className="max-w-2xl mx-auto p-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl">
            <h3 className="text-lg font-semibold text-white mb-4">How AURA Works</h3>
            <div className="space-y-3 text-sm text-white/80">
              <p>
                <strong className="text-[#00d4ff]">Step 1:</strong> Follow a moving dot with your eyes while keeping your head still. This measures eye tracking stability.
              </p>
              <p>
                <strong className="text-[#00d4ff]">Step 2:</strong> Read a simple sentence aloud. This measures speech rhythm and clarity.
              </p>
              <p>
                <strong className="text-[#00d4ff]">Step 3:</strong> Receive your cognitive stability summary with clear, easy-to-understand results.
              </p>
              <p className="text-white/60 mt-4 text-xs">The entire assessment takes about 3–5 minutes.</p>
            </div>
          </Card>
        )}
      </div>

      <VoiceAssistantButton instructionType="landing" transcript={LOGIN_PAGE_TRANSCRIPT} />
    </div>
  );
}
