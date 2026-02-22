import { RequireAuth } from "./components/require-auth";
import { InstructionsScreen } from "./screens/instructions-screen";
import { EyeTestScreen } from "./screens/eye-test-screen";
import { VoiceTestScreen } from "./screens/voice-test-screen";
import { ResultsScreen } from "./screens/results-screen";
import { EmergencyAlertScreen } from "./screens/emergency-alert-screen";

export function ProtectedInstructions() {
  return (
    <RequireAuth>
      <InstructionsScreen />
    </RequireAuth>
  );
}
export function ProtectedEyeTest() {
  return (
    <RequireAuth>
      <EyeTestScreen />
    </RequireAuth>
  );
}
export function ProtectedVoiceTest() {
  return (
    <RequireAuth>
      <VoiceTestScreen />
    </RequireAuth>
  );
}
export function ProtectedResults() {
  return (
    <RequireAuth>
      <ResultsScreen />
    </RequireAuth>
  );
}
export function ProtectedEmergency() {
  return (
    <RequireAuth>
      <EmergencyAlertScreen />
    </RequireAuth>
  );
}
