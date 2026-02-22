import { useNavigate } from "react-router";
import { AlertTriangle, Phone, Download, RotateCcw } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { VoiceAssistantButton } from "../components/voice-assistant-button";
import { motion } from "motion/react";

export function EmergencyAlertScreen() {
  const navigate = useNavigate();

  const transcript = `We have noticed significant instability in today's assessment. This does not necessarily mean there is a problem, but we recommend taking the following steps: Contact your caregiver or healthcare provider to discuss these results. You may also save the report for your records or retake the test if you experienced any technical difficulties.`;

  return (
    <div className="min-h-screen bg-[#0a0f1e] p-6 relative overflow-hidden">
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#f59e0b]/10 via-transparent to-[#ef4444]/10" />

      <div className="max-w-3xl mx-auto space-y-8 relative z-10">
        {/* Alert Header */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", duration: 0.6 }}
          className="text-center space-y-4"
        >
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-[#f59e0b] to-[#f59e0b]/80">
            <AlertTriangle className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">
            Assessment Results Require Attention
          </h1>
          <p className="text-sm text-white/60 max-w-lg mx-auto">
            We noticed significant instability in today's assessment
          </p>
        </motion.div>

        {/* Main Information Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="p-6 bg-white/5 backdrop-blur-xl border border-[#f59e0b]/30 rounded-2xl">
            <div className="space-y-5">
              <div className="p-4 bg-[#f59e0b]/10 rounded-xl border border-[#f59e0b]/20">
                <p className="text-sm text-white leading-relaxed">
                  This does <strong className="text-[#f59e0b]">not necessarily mean there is a problem</strong>. 
                  Results can be affected by fatigue, lighting, or technical issues.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="text-base font-semibold text-white">
                  What to do next:
                </h3>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-7 h-7 bg-gradient-to-br from-[#00d4ff] to-[#7c3aed] rounded-full flex items-center justify-center text-xs font-semibold text-white">
                    1
                  </div>
                  <p className="text-sm text-white/80 pt-0.5">
                    <strong className="text-white">Contact your caregiver</strong> or healthcare provider to review these results together.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-7 h-7 bg-gradient-to-br from-[#00d4ff] to-[#7c3aed] rounded-full flex items-center justify-center text-xs font-semibold text-white">
                    2
                  </div>
                  <p className="text-sm text-white/80 pt-0.5">
                    <strong className="text-white">Save the report</strong> to share with your medical team.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-7 h-7 bg-gradient-to-br from-[#00d4ff] to-[#7c3aed] rounded-full flex items-center justify-center text-xs font-semibold text-white">
                    3
                  </div>
                  <p className="text-sm text-white/80 pt-0.5">
                    If you felt unwell or had technical difficulties, you may <strong className="text-white">retake the test</strong> when ready.
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="space-y-3"
        >
          <Button
            className="w-full h-14 bg-gradient-to-r from-[#00d4ff] to-[#7c3aed] hover:opacity-90 text-white text-sm font-semibold rounded-xl shadow-lg shadow-[#00d4ff]/20"
          >
            <Phone className="mr-2 h-5 w-5" />
            Contact Caregiver
          </Button>

          <div className="grid md:grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="h-12 border border-white/10 bg-white/5 text-white hover:bg-white/10 text-sm rounded-xl"
            >
              <Download className="mr-2 h-4 w-4" />
              Save Report
            </Button>
            <Button
              onClick={() => navigate("/welcome")}
              variant="outline"
              className="h-12 border border-white/10 bg-white/5 text-white hover:bg-white/10 text-sm rounded-xl"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Retake Test
            </Button>
          </div>
        </motion.div>

        {/* Reassurance Card */}
        <Card className="p-5 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl">
          <div className="text-center">
            <p className="text-sm text-white/80 leading-relaxed">
              <strong className="text-white">Remember:</strong> A single assessment is just one data point. 
              Your healthcare provider can help interpret these results in the context of your overall health.
            </p>
          </div>
        </Card>

        {/* Support Contact */}
        <Card className="p-4 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl">
          <div className="flex items-center justify-center gap-2 text-white/60">
            <Phone className="h-4 w-4 text-[#00d4ff]" />
            <p className="text-xs">
              Need help? Call your healthcare provider or emergency services if needed
            </p>
          </div>
        </Card>
      </div>

      {/* Floating Voice Assistant Button */}
      <VoiceAssistantButton transcript={transcript} />
    </div>
  );
}
