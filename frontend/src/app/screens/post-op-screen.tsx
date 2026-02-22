import React from "react";
import { useNavigate } from "react-router";
import { Stethoscope } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { VoiceAssistantButton } from "../components/voice-assistant-button";

const POST_OP_TRANSCRIPT =
  "Post-op test. Run a post-operative assessment to compare against your baseline. Same short eye-tracking test—results appear on your dashboard. Complete the test when you're ready. Your results will be compared to your pre-op baseline.";

export function PostOpScreen() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-[#0a0f1e] relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#7c3aed]/10 via-transparent to-[#00d4ff]/10" />
      <div className="max-w-2xl mx-auto px-6 py-10 relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 mb-6">
          <Stethoscope className="h-12 w-12 text-[#00d4ff]" />
        </div>
        <h1 className="text-2xl font-bold text-white text-center mb-2">Post-op test</h1>
        <p className="text-white/60 text-center mb-8">
          Run a post-operative assessment to compare against your baseline. Same short
          eye-tracking test—results appear on your dashboard.
        </p>
        <Card className="p-6 bg-white/5 border border-white/10 rounded-xl w-full max-w-md mb-8">
          <p className="text-sm text-white/70 mb-4">
            Complete the test when you’re ready. Your results will be compared to your
            pre-op baseline.
          </p>
          <Button
            onClick={() => navigate("/instructions?mode=postop")}
            className="w-full h-12 bg-gradient-to-r from-[#00d4ff] to-[#7c3aed] hover:opacity-90 text-white font-semibold rounded-xl"
          >
            Start post-op test
          </Button>
        </Card>
      </div>
      <VoiceAssistantButton instructionType="post_op_start" transcript={POST_OP_TRANSCRIPT} />
    </div>
  );
}
