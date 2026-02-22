import { createBrowserRouter } from "react-router";
import { AuthScreen } from "./screens/auth-screen";
import { AppLayout } from "./components/app-layout";
import { InstructionsScreen } from "./screens/instructions-screen";
import { EyeTestScreen } from "./screens/eye-test-screen";
import { ResultsScreen } from "./screens/results-screen";
import { EmergencyAlertScreen } from "./screens/emergency-alert-screen";
import { DashboardScreen } from "./screens/dashboard-screen";
import { BaselineScreen } from "./screens/baseline-screen";
import { PostOpScreen } from "./screens/post-op-screen";
import { AboutScreen } from "./screens/about-screen";
import { ResearchReferencesScreen } from "./screens/research-references-screen";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: AppLayout,
    children: [
      { index: true, Component: AuthScreen },
      { path: "dashboard", Component: DashboardScreen },
      { path: "baseline", Component: BaselineScreen },
      { path: "post-op", Component: PostOpScreen },
      { path: "research", Component: ResearchReferencesScreen },
      { path: "about", Component: AboutScreen },
      { path: "instructions", Component: InstructionsScreen },
      { path: "eye-test", Component: EyeTestScreen },
      { path: "results", Component: ResultsScreen },
      { path: "emergency", Component: EmergencyAlertScreen },
    ],
  },
]);
