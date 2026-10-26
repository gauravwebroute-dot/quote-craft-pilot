import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TopNav } from "@/components/qp/TopNav";
import { RfqHeader } from "@/components/qp/RfqHeader";
import { SectionInput, type ExtractionResult } from "@/components/qp/SectionInput";
import { SectionExtraction } from "@/components/qp/SectionExtraction";
import { SectionOdoo } from "@/components/qp/SectionOdoo";
import { TreeMenu, type NavigationTarget } from "@/components/qp/TreeMenu";
import { QuoteHistoryDialog, type QuoteRecord } from "@/components/qp/QuoteHistoryDialog";
import {
  getLocalSequence,
  advanceLocalSequence,
  getLocalQuotes,
  setLocalSequence,
  saveLocalQuote,
  resetLocalQuoteData,
} from "@/lib/localQuoteStore";
import { commitQuote } from "@/lib/quoteCommit";
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
  const [poFiles, setPoFiles] = useState<File[]>([]);
  // The Input form stays mounted (hidden) while other steps are shown, so nothing typed or uploaded is lost
  // when the operator goes Back. It is only cleared by "New Quote" / Reset (which bump this key).
  const [inputFormKey, setInputFormKey] = useState(0);
  const [focusedSection, setFocusedSection] = useState<string>("overview");
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [businessUnit, setBusinessUnit] = useState("OC Custom Coating");

  // Dynamic cross-session quote sequence ID (REQ-002, Section 2)
  const [draftSequenceId, setDraftSequenceId] = useState<string>(() => getLocalSequence());
  const [odooOrderId, setOdooOrderId] = useState<string | null>(null);

  // Fetch current draft sequence on mount and sync with backend
  useEffect(() => {
    let cancelled = false;
    const fetchSequence = async () => {
      try {
        const response = await fetch(`${apiUrl()}/api/quotes/current-sequence`);
        if (response.ok) {
          const data = await response.json();
          if (data?.draftSequenceId && !cancelled) {
            setDraftSequenceId(data.draftSequenceId);
            setLocalSequence(data.draftSequenceId);
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

  // New Quote: a number is only "used" once a quote is committed (Save Draft / CSV export / Odoo sync).
  // So the server's next free number is the same number if nothing was committed, or +1 if it was.
  const handleNewQuote = async () => {
    try {
      const response = await fetch(`${apiUrl()}/api/quotes/current-sequence`);
      if (!response.ok) throw new Error("sequence unavailable");
      const data = await response.json();
      if (data?.draftSequenceId) {
        setDraftSequenceId(data.draftSequenceId);
        setLocalSequence(data.draftSequenceId);
      }
    } catch (err) {
      console.warn("Could not read the sequence from the server:", err);
      // Offline fallback: only move on if the current number was really committed in this browser.
      const committed = getLocalQuotes().some((q) => q.draftSequenceId === draftSequenceId);
      if (committed) setDraftSequenceId(advanceLocalSequence());
    }

    setExtraction(null);
    setUploadedFiles([]);
    setPoFiles([]);
    setInputFormKey((k) => k + 1);
    setOdooOrderId(null);
    setStep(0);
    setFocusedSection("overview");
  };

  // Reset: wipes every saved quote in the database + this browser and restarts at QPyy-0001
  const handleResetNumbering = async () => {
    try {
      const response = await fetch(`${apiUrl()}/api/quotes/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "RESET" }),
      });
      if (!response.ok) {
        // Surface the server's real reason (disabled, database permission, unreachable...) instead of a generic message.
        let reason = `Server responded ${response.status}.`;
        try {
          const body = await response.json();
          reason = [body?.message, body?.detail].filter(Boolean).join(" - ") || reason;
        } catch {
          // non-JSON error page (e.g. the API is waking up or not deployed)
        }
        throw new Error(reason);
      }
      const data = await response.json();
      const first = resetLocalQuoteData();
      const next = data?.nextDraftSequenceId || first;
      setLocalSequence(next);
      setDraftSequenceId(next);
      setExtraction(null);
      setUploadedFiles([]);
      setPoFiles([]);
      setInputFormKey((k) => k + 1);
      setOdooOrderId(null);
      setStep(0);
      setFocusedSection("overview");
    } catch (err) {
      console.error("Reset failed:", err);
      const why = err instanceof Error && err.message ? `\n\nReason: ${err.message}` : "";
      window.alert(`Reset failed - the database was not cleared. Please try again.${why}`);
    }
  };

  // Save Draft (retains draft sequence ID without advancing, per Section 2.1 #2)
  const handleSaveDraft = async () => {
    if (!extraction) return;
    try {
      await commitQuote({
        status: "DRAFT",
        draftSequenceId,
        businessUnit,
        extraction,
        sourceFile: uploadedFiles[0]?.name,
      });
      alert(`Draft ${draftSequenceId} saved successfully.`);
    } catch (err) {
      console.error("Failed to save draft on backend:", err);
      alert(`Draft ${draftSequenceId} saved in this browser only.`);
    }
  };

  const activeQuoteNumber = odooOrderId ? `${draftSequenceId} (${odooOrderId})` : draftSequenceId;

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <TopNav
        onOpenHistory={() => setHistoryOpen(true)}
        onNewQuote={handleNewQuote}
        onSaveDraft={handleSaveDraft}
        onResetNumbering={handleResetNumbering}
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

            <div className={step === 0 ? "" : "hidden"} aria-hidden={step !== 0}>
              <SectionInput
                key={inputFormKey}
                currentDraftId={draftSequenceId}
                businessUnit={businessUnit}
                onBusinessUnitChange={setBusinessUnit}
                onViewQuote={handleRehydrateState}
                onDuplicateDecision={(d) => {
                  if (d.action === "revision" && d.quoteNumber) setDraftSequenceId(d.quoteNumber);
                }}
                onRun={(result, files, _action, orderFiles) => {
                  setExtraction(result);
                  setUploadedFiles(files);
                  setPoFiles(orderFiles ?? []);
                  setStep(1);
                  setFocusedSection("overview");
                }}
              />
            </div>

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
                poFiles={poFiles}
                onPatchPart={(index, patch) =>
                  setExtraction((prev) =>
                    prev
                      ? {
                          ...prev,
                          parts: prev.parts.map((part, i) =>
                            i === index ? { ...part, ...patch } : part,
                          ),
                        }
                      : prev,
                  )
                }
                quoteNumber={draftSequenceId}
                businessUnit={businessUnit}
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
                onSyncComplete={(odooName) => {
                  // Keep showing this quote's own number next to its Odoo number; the next number is
                  // handed out when the operator presses New Quote.
                  setOdooOrderId(odooName);
                }}
                onViewQuote={(quote, payload) =>
                  handleRehydrateState(quote as unknown as QuoteRecord, payload)
                }
                onApplyPrice={(partNumber, source, unitPrice) =>
                  setExtraction((prev) =>
                    prev
                      ? {
                          ...prev,
                          parts: prev.parts.map((part) =>
                            (part.partNumber ?? null) === partNumber
                              ? {
                                  ...part,
                                  priceSource: source,
                                  priceOverrideUnit:
                                    source !== "QP_ESTIMATE" ? (unitPrice ?? undefined) : undefined,
                                  priceRef: undefined,
                                }
                              : part,
                          ),
                        }
                      : prev,
                  )
                }
              />
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
