import { useNavigate, useSearchParams } from "react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { VoiceAssistantButton } from "../components/voice-assistant-button";
import { motion } from "motion/react";

export function InstructionsScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode") === "postop" ? "postop" : "baseline";
  const isDemo = searchParams.get("demo") === "1";
  const transcript = `Step 1: Follow the dot. Please sit comfortably and keep your head still. A blue dot will flash from side to side—follow it with your eyes only. Then it will move smoothly left and right. Follow the dot with your eyes only, not your head. When you're ready, press Begin Test.`;

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#7c3aed]/10 via-transparent to-[#00d4ff]/10" />

      <div className="max-w-4xl w-full space-y-8 relative z-10">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-block px-4 py-2 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full mb-3">
            <p className="text-sm text-[#00d4ff]">Step 1 of 2</p>
          </div>
          <h1 className="text-3xl font-bold text-white">Follow the Moving Dot</h1>
        </div>

        {/* Instruction Card */}
        <Card className="p-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl">
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-[#00d4ff] to-[#7c3aed] rounded-full flex items-center justify-center text-sm font-semibold text-white">
                  1
                </div>
                <p className="text-sm text-white/80 pt-1">Please sit comfortably.</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-[#00d4ff] to-[#7c3aed] rounded-full flex items-center justify-center text-sm font-semibold text-white">
                  2
                </div>
                <p className="text-sm text-white/80 pt-1">Keep your head still.</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-[#00d4ff] to-[#7c3aed] rounded-full flex items-center justify-center text-sm font-semibold text-white">
                  3
                </div>
                <p className="text-sm text-white/80 pt-1">Follow the dot with your eyes only—it will flash side to side, then move smoothly.</p>
              </div>
            </div>

            {/* Animated Demo: dot flashes left–right like the real test (saccade trials) */}
            <div className="bg-[#0a0f1e] rounded-xl p-8 relative h-48 overflow-hidden border border-white/5">
              <p className="text-center text-xs text-white/50 mb-2">Demo: Dot flashes side to side</p>
              <div className="relative h-24 w-full">
                <motion.div
                  className="absolute w-6 h-6 bg-gradient-to-br from-[#00d4ff] to-[#7c3aed] rounded-full shadow-lg shadow-[#00d4ff]/50 -translate-x-1/2 -translate-y-1/2"
                  style={{ top: "50%" }}
                  animate={{
                    left: ["10%", "10%", "90%", "90%", "10%"],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    times: [0, 0.35, 0.42, 0.77, 0.84],
                    ease: "easeInOut",
                  }}
                />
              </div>
            </div>


          </div>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={() => navigate("/dashboard")}
            variant="outline"
            className="h-12 px-6 border border-white/10 bg-white/5 text-white hover:bg-white/10 text-sm rounded-xl"
          >
            Back
          </Button>
          <Button
            onClick={() => navigate(`/eye-test?mode=${mode}${isDemo ? "&demo=1" : ""}`)}
            className="flex-1 h-12 bg-gradient-to-r from-[#00d4ff] to-[#7c3aed] hover:opacity-90 text-white text-sm font-semibold rounded-xl shadow-lg shadow-[#00d4ff]/20"
          >
            Begin Test
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Floating Voice Assistant Button */}
      <VoiceAssistantButton transcript={transcript} />
    </div>
  );
}
