import { useNavigate } from "react-router";
import { Mic, Play, Volume2, ArrowRight } from "lucide-react";
import { useState } from "react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { VoiceAssistantButton } from "../components/voice-assistant-button";
import { motion } from "motion/react";

export function VoiceTestScreen() {
  const navigate = useNavigate();
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecorded, setHasRecorded] = useState(false);

  const testSentence = "Today is a calm and steady day.";

  const handleRecord = () => {
    if (!isRecording) {
      setIsRecording(true);
      setHasRecorded(false);
      // Simulate recording for 5 seconds
      setTimeout(() => {
        setIsRecording(false);
        setHasRecorded(true);
      }, 5000);
    }
  };

  const handleContinue = () => {
    // Determine if results should go to emergency or normal results
    const isHighRisk = Math.random() > 0.7; // 30% chance for demo
    navigate(isHighRisk ? "/emergency" : "/results");
  };

  const transcript = `Step 2: Short Voice Check. Please read the sentence displayed on screen slowly and clearly. Press the microphone button when you're ready to record. After recording, you can replay it or continue to your results.`;

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#7c3aed]/10 via-transparent to-[#00d4ff]/10" />

      <div className="max-w-3xl w-full space-y-8 relative z-10">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-block px-4 py-2 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full mb-3">
            <p className="text-sm text-[#00d4ff]">Step 2 of 2</p>
          </div>
          <h1 className="text-3xl font-bold text-white">Short Voice Check</h1>
          <p className="text-sm text-white/60">
            Please read the sentence below slowly and clearly
          </p>
        </div>

        {/* Test Sentence Card */}
        <Card className="p-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl">
          <p className="text-center text-white text-xl font-medium leading-relaxed">
            "{testSentence}"
          </p>
        </Card>

        {/* Recording Button */}
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={handleRecord}
            disabled={isRecording}
            className={`w-24 h-24 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 ${
              isRecording
                ? "bg-gradient-to-br from-[#ef4444] to-[#ef4444]/80 scale-110 animate-pulse"
                : "bg-gradient-to-br from-[#00d4ff] to-[#7c3aed] hover:scale-105 active:scale-95"
            }`}
            aria-label={isRecording ? "Recording..." : "Start Recording"}
          >
            <Mic className="h-10 w-10 text-white" />
          </button>

          <p className="text-base text-white">
            {isRecording ? "Recording..." : hasRecorded ? "Recording Complete" : "Tap to Record"}
          </p>
        </div>

        {/* Waveform Visualization */}
        {(isRecording || hasRecorded) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/5 backdrop-blur-xl p-6 rounded-2xl border border-white/10"
          >
            <div className="flex items-end justify-center gap-1 h-24">
              {Array.from({ length: 40 }).map((_, i) => (
                <motion.div
                  key={i}
                  className="w-1.5 bg-gradient-to-t from-[#00d4ff] to-[#7c3aed] rounded-full"
                  animate={{
                    height: isRecording
                      ? [16, Math.random() * 80 + 16, 16]
                      : hasRecorded
                      ? Math.random() * 60 + 16
                      : 16,
                  }}
                  transition={{
                    duration: 0.5,
                    repeat: isRecording ? Infinity : 0,
                    delay: i * 0.05,
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* Action Buttons */}
        {hasRecorded && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-3"
          >
            <Button
              onClick={() => setHasRecorded(false)}
              variant="outline"
              className="flex-1 h-12 border border-white/10 bg-white/5 text-white hover:bg-white/10 text-sm rounded-xl"
            >
              <Play className="mr-2 h-4 w-4" />
              Replay
            </Button>
            <Button
              onClick={handleContinue}
              className="flex-1 h-12 bg-gradient-to-r from-[#00d4ff] to-[#7c3aed] hover:opacity-90 text-white text-sm font-semibold rounded-xl shadow-lg shadow-[#00d4ff]/20"
            >
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </motion.div>
        )}

        {!hasRecorded && (
          <div className="flex justify-start">
            <Button
              onClick={() => navigate("/eye-test")}
              variant="outline"
              className="h-10 px-5 border border-white/10 bg-white/5 text-white hover:bg-white/10 text-sm rounded-xl"
            >
              Back
            </Button>
          </div>
        )}

        {/* Voice Guidance Info */}
        <Card className="p-4 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl">
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-[#00d4ff]" />
            <p className="text-xs text-white/60">
              Voice guidance will read the sentence for you
            </p>
          </div>
        </Card>
      </div>

      {/* Floating Voice Assistant Button */}
      <VoiceAssistantButton transcript={transcript} />
    </div>
  );
}
