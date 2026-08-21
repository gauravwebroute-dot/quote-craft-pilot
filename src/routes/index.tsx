import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { TopNav } from "@/components/qp/TopNav";
import { Stepper } from "@/components/qp/Stepper";
import { RfqHeader } from "@/components/qp/RfqHeader";
import { SectionInput } from "@/components/qp/SectionInput";
import { SectionExtraction } from "@/components/qp/SectionExtraction";
import { SectionOdoo } from "@/components/qp/SectionOdoo";
import { TreeMenu, type NavigationTarget } from "@/components/qp/TreeMenu";
import { Button } from "@/components/ui/button";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "QuotePilot — RFQ to Priced Quote for Coating Estimators" },
      {
        name: "description",
        content:
          "QuotePilot turns customer RFQ emails into structured, priced powder coating quotes and cross-checks them against Odoo before export.",
      },
      { property: "og:title", content: "QuotePilot — RFQ Automation for Coating Estimators" },
      {
        property: "og:description",
        content:
          "Extract coating specs, price each part, and cross-check customers and parts against Odoo before exporting the quote.",
      },
    ],
  }),
  component: QuotePilot,
});

function QuotePilot() {
  const [step, setStep] = useState(1);
  const [focusedSection, setFocusedSection] = useState<string>("all");
  const [sidebarVisible, setSidebarVisible] = useState(true);

  const handleNavigate = (target: NavigationTarget) => {
    setStep(target.step);
    if (target.section) {
      setFocusedSection(target.section);
    }
  };

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <TopNav />
      <Stepper
        active={step}
        onChange={(s) => {
          setStep(s);
          setFocusedSection("all");
        }}
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Mobile / Quick Sidebar Toggle */}
        <div className="mb-4 flex items-center justify-between lg:hidden">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSidebarVisible(!sidebarVisible)}
            className="gap-2 text-xs"
          >
            {sidebarVisible ? (
              <>
                <PanelLeftClose className="size-4" /> Hide Menu
              </>
            ) : (
              <>
                <PanelLeftOpen className="size-4" /> Show RFQ Menu
              </>
            )}
          </Button>
          <span className="text-xs text-muted-foreground">
            Current: {step === 0 ? "1. Input Form" : step === 1 ? "2. Extraction" : "3. Odoo"}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          {/* Nested Tree Menu Sidebar */}
          {sidebarVisible && (
            <aside className="lg:col-span-3 lg:sticky lg:top-36 space-y-4">
              <TreeMenu
                currentStep={step}
                currentSection={focusedSection}
                onNavigate={handleNavigate}
              />
            </aside>
          )}

          {/* Main Workspace / Section Content */}
          <div
            className={
              sidebarVisible
                ? "lg:col-span-9 space-y-6"
                : "lg:col-span-12 space-y-6"
            }
          >
            <RfqHeader />

            {step === 0 ? (
              <SectionInput
                onRun={() => {
                  setStep(1);
                  setFocusedSection("all");
                }}
              />
            ) : null}

            {step === 1 ? (
              <SectionExtraction
                onBack={() => {
                  setStep(0);
                  setFocusedSection("all");
                }}
                onContinue={() => {
                  setStep(2);
                  setFocusedSection("all");
                }}
                focusedSection={focusedSection}
                onSelectSection={(sec) => setFocusedSection(sec)}
              />
            ) : null}

            {step === 2 ? (
              <SectionOdoo
                onBack={() => {
                  setStep(1);
                  setFocusedSection("all");
                }}
              />
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
