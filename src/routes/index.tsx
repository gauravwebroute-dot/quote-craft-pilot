import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { TopNav } from "@/components/qp/TopNav";
import { RfqHeader } from "@/components/qp/RfqHeader";
import { SectionInput, type ExtractionResult } from "@/components/qp/SectionInput";
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
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [focusedSection, setFocusedSection] = useState<string>("summary");
  const [sidebarVisible, setSidebarVisible] = useState(true);

  // Quote number: QP<year>-0001. NOTE - the "0001" here is a placeholder.
  // A real auto-incrementing-per-year counter needs to live in a backend/
  // database (so two estimators never get the same number) - this frontend
  // can only display whatever number the backend hands it once that exists.
  const quoteNumber = `QP${new Date().getFullYear().toString().slice(-2)}-0001`;

  const handleNavigate = (target: NavigationTarget) => {
    setStep(target.step);
    if (target.section) {
      setFocusedSection(target.section);
    }
  };

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <TopNav />

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
                quoteNumber={quoteNumber}
              />
            </aside>
          )}

          {/* Main Workspace / Section Content */}
          <div className={sidebarVisible ? "lg:col-span-9 space-y-6" : "lg:col-span-12 space-y-6"}>
            <RfqHeader />

            {step === 0 ? (
              <SectionInput
                onRun={(result) => {
                  setExtraction(result);
                  setStep(1);
                  setFocusedSection("summary");
                }}
              />
            ) : null}

            {step === 1 ? (
              <SectionExtraction
                onBack={() => {
                  setStep(0);
                  setFocusedSection("summary");
                }}
                onContinue={() => {
                  setStep(2);
                  setFocusedSection("summary");
                }}
                focusedSection={focusedSection}
                onSelectSection={(sec) => setFocusedSection(sec)}
                extraction={extraction}
              />
            ) : null}

            {step === 2 ? (
              <SectionOdoo
                onBack={() => {
                  setStep(1);
                  setFocusedSection("summary");
                }}
                extraction={extraction}
              />
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
