import { useNavigate } from "react-router";
import { Activity, Info } from "lucide-react";
import { useState } from "react";
import { Button } from "../components/ui/button";
import { VoiceAssistantButton } from "../components/voice-assistant-button";
import { Card } from "../components/ui/card";

export function WelcomeScreen() {
  const navigate = useNavigate();
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  const transcript = `Welcome to AURA, the Advanced Under-eye Response Assessment. This simple test measures cognitive stability through eye movements and voice patterns. Please enable voice guidance for step-by-step instructions, and adjust the text size to your comfort. When you're ready, press Start Assessment.`;

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Gradient Background */}
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
          {/* Thin flashy bar that shrinks at the ends, sinks with the logo */}
          <div className="w-full max-w-md mx-auto mt-3 relative overflow-visible flex justify-center">
            <div
              className="h-0.5 w-full max-w-[85%] rounded-full"
              style={{
                background: "linear-gradient(90deg, transparent 0%, rgba(0,212,255,0.95) 12%, #00d4ff 25%, #7c3aed 50%, #00d4ff 75%, rgba(0,212,255,0.95) 88%, transparent 100%)",
                boxShadow: "0 0 16px rgba(0,212,255,0.7), 0 0 32px rgba(124,58,237,0.5)",
                animation: "shimmer-sink 2.5s ease-in-out infinite",
              }}
            />
          </div>
          <p className="text-lg text-white/80">
            Advanced Under-eye Response Assessment
          </p>
          <p className="text-sm text-white/60 max-w-xl mx-auto">
            A simple eye and voice check to measure cognitive stability
          </p>
        </div>

        {/* Main Actions */}
        <div className="space-y-3 max-w-md mx-auto">
          <Button
            onClick={() => navigate("/instructions")}
            className="w-full h-14 bg-gradient-to-r from-[#00d4ff] to-[#7c3aed] hover:opacity-90 text-white font-semibold text-base rounded-xl shadow-lg shadow-[#00d4ff]/20 transition-all duration-300 hover:scale-[1.02]"
          >
            Start Assessment
          </Button>

          <Button
            onClick={() => setShowHowItWorks(!showHowItWorks)}
            variant="outline"
            className="w-full h-12 border border-white/10 bg-white/5 backdrop-blur-xl text-white hover:bg-white/10 text-sm rounded-xl"
          >
            <Info className="mr-2 h-4 w-4" />
            How It Works
          </Button>
        </div>

        {/* How It Works Panel */}
        {showHowItWorks && (
          <Card className="max-w-2xl mx-auto p-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl">
            <h3 className="text-lg font-semibold text-white mb-4">
              How AURA Works
            </h3>
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
              <p className="text-white/60 mt-4 text-xs">
                The entire assessment takes about 3-5 minutes.
              </p>
            </div>
          </Card>
        )}

      </div>

      {/* Floating Voice Assistant Button */}
      <VoiceAssistantButton transcript={transcript} />
    </div>
  );
}
