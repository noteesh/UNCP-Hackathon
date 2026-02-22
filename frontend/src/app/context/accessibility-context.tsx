import { createContext, useContext, useState, ReactNode } from "react";

interface AccessibilityContextType {
  textSize: number;
  setTextSize: (size: number) => void;
  darkMode: boolean;
  setDarkMode: (mode: boolean) => void;
  voiceGuidance: boolean;
  setVoiceGuidance: (enabled: boolean) => void;
  adjustTextSize: (increase: boolean) => void;
}

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [textSize, setTextSize] = useState(100);
  const [darkMode, setDarkMode] = useState(false);
  const [voiceGuidance, setVoiceGuidance] = useState(true);

  const adjustTextSize = (increase: boolean) => {
    setTextSize((prev) => {
      if (increase && prev < 140) return prev + 20;
      if (!increase && prev > 80) return prev - 20;
      return prev;
    });
  };

  return (
    <AccessibilityContext.Provider
      value={{
        textSize,
        setTextSize,
        darkMode,
        setDarkMode,
        voiceGuidance,
        setVoiceGuidance,
        adjustTextSize,
      }}
    >
      <div
        className={darkMode ? "dark" : ""}
        style={{ fontSize: `${textSize}%` }}
      >
        {children}
      </div>
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error("useAccessibility must be used within AccessibilityProvider");
  }
  return context;
}
