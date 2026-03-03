"use client";

import { createContext, useContext, useState, ReactNode } from "react";

export interface WizardData {
  city: string;
  days: number;
  budget: "cheap" | "moderate" | "splurge";
  interests: string[];
  localnessLevel: number;
  pace: "relaxed" | "moderate" | "active" | "packed";
  groupType: string;
  templatePrompt?: string;
}

interface WizardContextType {
  currentStep: number;
  totalSteps: number;
  data: WizardData;
  setData: (data: Partial<WizardData>) => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (step: number) => void;
  canProceed: boolean;
  setCanProceed: (value: boolean) => void;
}

const defaultData: WizardData = {
  city: "",
  days: 3,
  budget: "moderate",
  interests: [],
  localnessLevel: 3,
  pace: "moderate",
  groupType: "solo",
};

const WizardContext = createContext<WizardContextType | undefined>(undefined);

export function WizardProvider({
  children,
  initialData = {},
  initialStep = 0,
}: {
  children: ReactNode;
  initialData?: Partial<WizardData>;
  initialStep?: number;
}) {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [data, setDataState] = useState<WizardData>({ ...defaultData, ...initialData });
  const [canProceed, setCanProceed] = useState(false);
  const totalSteps = 4;

  const setData = (newData: Partial<WizardData>) => {
    setDataState(prev => ({ ...prev, ...newData }));
  };

  const nextStep = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(prev => prev + 1);
      setCanProceed(false);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const goToStep = (step: number) => {
    if (step >= 0 && step < totalSteps) {
      setCurrentStep(step);
    }
  };

  return (
    <WizardContext.Provider
      value={{
        currentStep,
        totalSteps,
        data,
        setData,
        nextStep,
        prevStep,
        goToStep,
        canProceed,
        setCanProceed,
      }}
    >
      {children}
    </WizardContext.Provider>
  );
}

export function useWizard() {
  const context = useContext(WizardContext);
  if (context === undefined) {
    throw new Error("useWizard must be used within a WizardProvider");
  }
  return context;
}
