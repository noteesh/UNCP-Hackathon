import React from "react";
import { useNavigate } from "react-router";
import { Target } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { VoiceAssistantButton } from "../components/voice-assistant-button";

const BASELINE_TRANSCRIPT =
  "Pre-op baseline. Establish your baseline before surgery. You will follow the dot with your eyes and complete a short voice check. The test takes a few minutes. Keep your head still and follow the on-screen instructions.";

export function BaselineScreen() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-[#0a0f1e] relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#7c3aed]/10 via-transparent to-[#00d4ff]/10" />
      <div className="max-w-2xl mx-auto px-6 py-10 relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 mb-6">
          <Target className="h-12 w-12 text-[#00d4ff]" />
        </div>
        <h1 className="text-2xl font-bold text-white text-center mb-2">Pre-op baseline</h1>
        <p className="text-white/60 text-center mb-8">
          Establish your baseline before surgery. You will follow the dot with your eyes and
          complete a short voice check. This gives us a reference for later comparisons.
        </p>
        <Card className="p-6 bg-white/5 border border-white/10 rounded-xl w-full max-w-md mb-8">
          <p className="text-sm text-white/70 mb-4">
            The test takes a few minutes. Keep your head still and follow the on-screen
            instructions.
          </p>
          <Button
            onClick={() => navigate("/instructions?mode=baseline")}
            className="w-full h-12 bg-gradient-to-r from-[#00d4ff] to-[#7c3aed] hover:opacity-90 text-white font-semibold rounded-xl"
          >
            Start baseline assessment
          </Button>
        </Card>
      </div>
      <VoiceAssistantButton instructionType="baseline_start" transcript={BASELINE_TRANSCRIPT} />
    </div>
  );
}
