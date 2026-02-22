import { createBrowserRouter } from "react-router";
import { AuthScreen } from "./screens/auth-screen";
import { WelcomeScreen } from "./screens/welcome-screen";
import { InstructionsScreen } from "./screens/instructions-screen";
import { EyeTestScreen } from "./screens/eye-test-screen";
import { VoiceTestScreen } from "./screens/voice-test-screen";
import { ResultsScreen } from "./screens/results-screen";
import { EmergencyAlertScreen } from "./screens/emergency-alert-screen";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: AuthScreen,
  },
  {
    path: "/welcome",
    Component: WelcomeScreen,
  },
  {
    path: "/instructions",
    Component: InstructionsScreen,
  },
  {
    path: "/eye-test",
    Component: EyeTestScreen,
  },
  {
    path: "/voice-test",
    Component: VoiceTestScreen,
  },
  {
    path: "/results",
    Component: ResultsScreen,
  },
  {
    path: "/emergency",
    Component: EmergencyAlertScreen,
  },
]);
