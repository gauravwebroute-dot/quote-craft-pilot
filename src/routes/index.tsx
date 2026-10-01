import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TopNav } from "@/components/qp/TopNav";
import { RfqHeader } from "@/components/qp/RfqHeader";
import { SectionInput, type ExtractionResult } from "@/components/qp/SectionInput";
import { SectionExtraction } from "@/components/qp/SectionExtraction";
import { SectionOdoo } from "@/components/qp/SectionOdoo";
import { TreeMenu, type NavigationTarget } from "@/components/qp/TreeMenu";
import { QuoteHistoryDialog, type QuoteRecord } from "@/components/qp/QuoteHistoryDialog";
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
        name: "og:description",
        content:
          "Extract coating specs, price each part, and cross-check customers and parts against Odoo before exporting the quote.",
      },
    ],
  }),
  component: QuotePilot,
});

function apiUrl() {
  return (
    import.meta.env["VITE_EXTRACTION_API_URL"] ||
    (typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
      ? "http://localhost:4000"
      : "https://quote-craft-pilot.onrender.com")
  ).replace(/\/$/, "");
}

function QuotePilot() {
  const [step, setStep] = useState(0);
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [focusedSection, setFocusedSection] = useState<string>("overview");
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [businessUnit, setBusinessUnit] = useState("OC Custom Coating");

  // Dynamic cross-session quote sequence ID (REQ-002, Section 2)
  const [draftSequenceId, setDraftSequenceId] = useState<string>(
    `QP${new Date().getFullYear().toString().slice(-2)}-0001`,
  );
  const [odooOrderId, setOdooOrderId] = useState<string | null>(null);

  // Fetch current draft sequence on mount
  useEffect(() => {
    let cancelled = false;
    const fetchSequence = async () => {
      try {
        const response = await fetch(`${apiUrl()}/api/quotes/current-sequence`);
        if (response.ok) {
          const data = await response.json();
          if (data?.draftSequenceId && !cancelled) {
            setDraftSequenceId(data.draftSequenceId);
          }
        }
      } catch (err) {
        console.warn("Could not fetch sequence ID from backend:", err);
      }
    };

    fetchSequence();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleNavigate = (target: NavigationTarget) => {
    setStep(target.step);
    if (target.section) {
      setFocusedSection(target.section);
    }
  };

  // Rehydrate state from Quote History (REQ-009, Section 7.2)
  const handleRehydrateState = (quote: QuoteRecord, payload: ExtractionResult) => {
    setExtraction(payload);
    setDraftSequenceId(quote.draftSequenceId);
    if (quote.odooSequenceId) {
      setOdooOrderId(quote.odooSequenceId);
    } else {
      setOdooOrderId(null);
    }
    if (quote.businessUnit) {
      setBusinessUnit(quote.businessUnit);
    }
    setStep(1);
    setFocusedSection("overview");
  };

  // Trigger New Quote: advances sequence counter atomically (REQ-002, Section 2.1)
  const handleNewQuote = async () => {
    try {
      const response = await fetch(`${apiUrl()}/api/quotes/next-sequence`, {
        method: "POST",
      });
      if (response.ok) {
        const data = await response.json();
        if (data?.draftSequenceId) {
          setDraftSequenceId(data.draftSequenceId);
        }
      }
    } catch (err) {
      console.warn("Could not advance sequence counter:", err);
    }

    setExtraction(null);
    setUploadedFiles([]);
    setOdooOrderId(null);
    setStep(0);
    setFocusedSection("overview");
  };

  // Save Draft (retains draft sequence ID without advancing, per Section 2.1 #2)
  const handleSaveDraft = async () => {
    if (!extraction) return;
    try {
      await fetch(`${apiUrl()}/api/quotes/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftSequenceId,
          businessUnit,
          customer: extraction.customer,
          parts: extraction.parts,
          sourceFile: uploadedFiles[0]?.name || "manual_draft.pdf",
          formPayload: extraction,
          status: "DRAFT",
        }),
      });
      alert(`Draft ${draftSequenceId} saved successfully.`);
    } catch (err) {
      console.error("Failed to save draft:", err);
    }
  };

  const activeQuoteNumber = odooOrderId ? `${draftSequenceId} (${odooOrderId})` : draftSequenceId;

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <TopNav
        onOpenHistory={() => setHistoryOpen(true)}
        onNewQuote={handleNewQuote}
        onSaveDraft={handleSaveDraft}
        quoteNumber={activeQuoteNumber}
      />

      <QuoteHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onRehydrateState={handleRehydrateState}
      />

      <main className="mx-auto max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8">
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

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* Nested Tree Menu Sidebar */}
          {sidebarVisible && (
            <aside className="lg:sticky lg:top-36 lg:w-72 lg:shrink-0 space-y-4">
              <TreeMenu
                currentStep={step}
                currentSection={focusedSection}
                onNavigate={handleNavigate}
                quoteNumber={activeQuoteNumber}
                extraction={extraction}
              />
            </aside>
          )}

          {/* Main Workspace / Section Content */}
          <div className="min-w-0 flex-1 space-y-6">
            <RfqHeader
              extraction={extraction}
              quoteNumber={activeQuoteNumber}
              businessUnit={businessUnit}
            />

            {step === 0 ? (
              <SectionInput
                currentDraftId={draftSequenceId}
                businessUnit={businessUnit}
                onBusinessUnitChange={setBusinessUnit}
                onRun={(result, files) => {
                  setExtraction(result);
                  setUploadedFiles(files);
                  setStep(1);
                  setFocusedSection("overview");
                }}
              />
            ) : null}

            {step === 1 ? (
              <SectionExtraction
                onBack={() => {
                  setStep(0);
                  setFocusedSection("overview");
                }}
                onContinue={() => {
                  setStep(2);
                  setFocusedSection("overview");
                }}
                focusedSection={focusedSection}
                onSelectSection={(sec) => setFocusedSection(sec)}
                extraction={extraction}
                uploadedFiles={uploadedFiles}
                quoteNumber={draftSequenceId}
              />
            ) : null}

            {step === 2 ? (
              <SectionOdoo
                onBack={() => {
                  setStep(1);
                  setFocusedSection("overview");
                }}
                extraction={extraction}
                quoteNumber={draftSequenceId}
                businessUnit={businessUnit}
                onSyncComplete={(odooName, nextSeq) => {
                  setOdooOrderId(odooName);
                  if (nextSeq) {
                    setDraftSequenceId(nextSeq);
                  } else {
                    void fetch(`${apiUrl()}/api/quotes/current-sequence`)
                      .then((r) => r.json())
                      .then((data) => {
                        if (data?.draftSequenceId) setDraftSequenceId(data.draftSequenceId);
                      });
                  }
                }}
              />
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
