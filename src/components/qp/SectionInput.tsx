import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useEffect, useRef, useState } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DuplicateDrawingDialog } from "./DuplicateDrawingDialog";
import { FileText, Upload, X, ArrowRight, Eye, RefreshCw, Sparkles } from "lucide-react";

const emailBody = `Hi,
Could we please get pricing for the attached items? The qty will be 6 each.
Thanks,
John
ABC Company
714-555-1212`;

export type ExtractionPart = {
  partNumber: string | null;
  partName: string | null;
  partSummary: string | null;
  revision: string | null;
  isAssembly: boolean | null;
  assemblyConfidence: "HIGH" | "MEDIUM" | "LOW" | null;
  quoteTarget: "ASSEMBLY" | "COMPONENTS" | "MIXED_SCOPE" | null;
  isProvisional: boolean | null;
  coatingPresent: boolean | null;
  existingCoating: string | null;
  material: string | null;
  partMark: boolean | null;
  partMarkSpec: string | null;
  prepType: string | null;
  hasScale: boolean | null;
  quantity: number | null;
  dimensions: {
    source:
      "EXPLICIT_CALLOUT" | "FLAT_PATTERN_VIEW" | "VISUAL_ESTIMATE_FROM_REFERENCE" | "NONE" | null;
    referenceObjectUsed: string | null;
    shapeType: "flat_plate" | "cylindrical" | "complex_folded" | "unknown" | null;
    overallLengthIn: number | null;
    overallWidthIn: number | null;
    overallHeightIn: number | null;
    diameterIn: number | null;
    holes: Array<{ diameterIn: number; count: number }>;
  } | null;
  totalSurfaceAreaSqIn: number;
  coatingAreaSqIn: number | null;
  maskingAreaSqIn: number | null;
  areaConfidence: "HIGH" | "MEDIUM-HIGH" | "MEDIUM" | "LOW-MEDIUM" | "LOW";
  estimationMethod: string | null;
  reasoningSummary: string | null;
  bomItems?: Array<{
    itemNumber: string | null;
    partNumber: string | null;
    description: string | null;
    quantity: number | null;
    material: string | null;
  }> | null;
  coatingBom: Record<string, string | null>;
  sourceDrawingFile: string | null;
};

export type ExtractionResult = {
  customer: Record<string, string | null>;
  parts: ExtractionPart[];
  extractionNotes: string[];
};

export type ModelOption = {
  id: string;
  name: string;
  description?: string;
  isDefault?: boolean;
};

const DEFAULT_MODELS: ModelOption[] = [
  {
    id: "~google/gemini-flash-latest",
    name: "Gemini Flash (latest)",
    description: "Default • Fast, high-throughput multimodal parsing",
    isDefault: true,
  },
  {
    id: "~anthropic/claude-sonnet-latest",
    name: "Claude Sonnet (latest)",
    description: "Precision blueprint & engineering drawing extraction",
    isDefault: false,
  },
  {
    id: "meta-llama/llama-4-scout",
    name: "Llama 4 Scout Vision (Groq)",
    description: "Ultra-fast open-weights vision parsing",
    isDefault: false,
  },
  {
    id: "~google/gemini-pro-latest",
    name: "Gemini Pro (latest)",
    description: "Deep reasoning & complex multi-part drawing analysis",
    isDefault: false,
  },
];

type DuplicateInfo = {
  quoteNumber: string;
  customerName: string;
  quoteId?: number | string;
  revisionCount?: number;
};

export function SectionInput({
  onRun,
  currentDraftId,
  businessUnit = "OC Custom Coating",
  onBusinessUnitChange,
}: {
  onRun: (
    extraction: ExtractionResult,
    files: File[],
    duplicateAction?: "revision" | "new" | null,
  ) => void;
  currentDraftId?: string;
  businessUnit?: string;
  onBusinessUnitChange?: (bu: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [emailText, setEmailText] = useState(emailBody);
  const [models, setModels] = useState<ModelOption[]>(DEFAULT_MODELS);
  const [selectedModel, setSelectedModel] = useState("~google/gemini-flash-latest");
  const [selectedBU, setSelectedBU] = useState(businessUnit || "OC Custom Coating");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Duplicate Warning Modal State (REQ-003, REQ-004)
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [duplicateData, setDuplicateData] = useState<DuplicateInfo | null>(null);
  const [pendingExtractionPayload, setPendingExtractionPayload] = useState<ExtractionResult | null>(
    null,
  );

  // Fetch dynamic models from OpenRouter endpoint on mount
  useEffect(() => {
    let cancelled = false;
    const fetchModels = async () => {
      setIsLoadingModels(true);
      try {
        const apiUrl = (
          import.meta.env["VITE_EXTRACTION_API_URL"] ||
          (typeof window !== "undefined" &&
          (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
            ? "http://localhost:4000"
            : "https://quote-craft-pilot.onrender.com")
        ).replace(/\/$/, "");

        const res = await fetch(`${apiUrl}/api/models`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.models) && data.models.length > 0 && !cancelled) {
            setModels(data.models);
            const exists = data.models.some((m: ModelOption) => m.id === selectedModel);
            if (!exists) {
              const def =
                data.models.find((m: ModelOption) => m.isDefault)?.id || data.models[0].id;
              setSelectedModel(def);
            }
          }
        }
      } catch (err) {
        console.warn("Could not fetch models dynamically, using defaults:", err);
      } finally {
        if (!cancelled) setIsLoadingModels(false);
      }
    };

    fetchModels();
    return () => {
      cancelled = true;
    };
  }, []);

  const computePdfHash = async (files: File[]) => {
    if (!files.length) return null;
    const file = files[0];
    if (!file) return null;
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  };

  const addFiles = async (selectedFiles: FileList | File[]) => {
    const validFiles = Array.from(selectedFiles).filter(
      (file) =>
        ["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(file.type) &&
        file.size <= 20 * 1024 * 1024,
    );
    const newFiles = [...uploadedFiles, ...validFiles].slice(0, 10);
    setUploadedFiles(newFiles);

    // Pre-check duplicate on file upload
    if (newFiles.length > 0) {
      try {
        const hash = await computePdfHash(newFiles);
        if (hash) {
          const apiUrl = (
            import.meta.env["VITE_EXTRACTION_API_URL"] ||
            (typeof window !== "undefined" &&
            (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
              ? "http://localhost:4000"
              : "https://quote-craft-pilot.onrender.com")
          ).replace(/\/$/, "");

          const res = await fetch(`${apiUrl}/api/quotes/duplicate-check`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pdfHash: hash,
              sourceFile: newFiles[0]?.name,
              businessUnit: selectedBU,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.duplicate) {
              setDuplicateData({
                quoteNumber: data.quoteNumber || data.quote?.draftSequenceId || "QP26-0001",
                customerName: data.customerName || data.quote?.customerName || "ABC Metal Works",
                quoteId: data.quote?.id,
                revisionCount: data.quote?.revisionCount || 1,
              });
              setDuplicateModalOpen(true);
            }
          }
        }
      } catch (err) {
        console.warn("Pre-upload duplicate check failed:", err);
      }
    }
  };

  const openFile = (file: File) => {
    window.open(URL.createObjectURL(file), "_blank", "noopener,noreferrer");
  };

  const executeExtraction = async (forceNewQuote = false) => {
    setError(null);
    setIsExtracting(true);
    try {
      const formData = new FormData();
      uploadedFiles.forEach((file) => formData.append("files", file));
      if (emailText.trim()) formData.append("emailText", emailText.trim());
      formData.append("model", selectedModel);
      const apiUrl = (
        import.meta.env["VITE_EXTRACTION_API_URL"] ||
        (typeof window !== "undefined" &&
        (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
          ? "http://localhost:4000"
          : "https://quote-craft-pilot.onrender.com")
      ).replace(/\/$/, "");

      const response = await fetch(`${apiUrl}/api/extract`, {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Extraction failed.");

      const pdfHash = await computePdfHash(uploadedFiles);

      // Check duplicate on extraction payload
      if (!forceNewQuote && pdfHash) {
        const duplicateResponse = await fetch(`${apiUrl}/api/quotes/duplicate-check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pdfHash,
            businessUnit: selectedBU,
            sourceFile: uploadedFiles[0]?.name || "unknown.pdf",
            customer: payload.extraction.customer,
            parts: payload.extraction.parts,
          }),
        });
        const duplicatePayload = await duplicateResponse.json();
        if (duplicatePayload.duplicate) {
          setDuplicateData({
            quoteNumber:
              duplicatePayload.quoteNumber ||
              duplicatePayload.quote?.draftSequenceId ||
              "QP26-0001",
            customerName:
              duplicatePayload.customerName ||
              duplicatePayload.quote?.customerName ||
              "ABC Metal Works",
            quoteId: duplicatePayload.quote?.id,
            revisionCount: duplicatePayload.quote?.revisionCount || 1,
          });
          setPendingExtractionPayload(payload.extraction);
          setDuplicateModalOpen(true);
          setIsExtracting(false);
          return;
        }
      }

      // Save quote record into DB
      await fetch(`${apiUrl}/api/quotes/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftSequenceId: currentDraftId,
          businessUnit: selectedBU,
          customer: payload.extraction.customer,
          parts: payload.extraction.parts,
          pdfHash,
          sourceFile: uploadedFiles[0]?.name || "unknown.pdf",
          formPayload: payload.extraction,
          status: "EXTRACTED",
          forceNewQuote,
        }),
      });

      onRun(payload.extraction, uploadedFiles, forceNewQuote ? "new" : null);
    } catch (requestError) {
      setError(
        requestError instanceof TypeError
          ? "Unable to reach the extraction service. Please refresh the page and try again."
          : requestError instanceof Error
            ? requestError.message
            : "Extraction failed.",
      );
    } finally {
      setIsExtracting(false);
    }
  };

  // Duplicate Warning Modal Actions (PRD Section 4.2)
  const handleModalCreateRevision = async () => {
    setDuplicateModalOpen(false);
    if (pendingExtractionPayload) {
      const apiUrl = (
        import.meta.env["VITE_EXTRACTION_API_URL"] ||
        (typeof window !== "undefined" &&
        (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
          ? "http://localhost:4000"
          : "https://quote-craft-pilot.onrender.com")
      ).replace(/\/$/, "");

      const pdfHash = await computePdfHash(uploadedFiles);
      await fetch(`${apiUrl}/api/quotes/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftSequenceId: duplicateData?.quoteNumber,
          businessUnit: selectedBU,
          customer: pendingExtractionPayload.customer,
          parts: pendingExtractionPayload.parts,
          pdfHash,
          sourceFile: uploadedFiles[0]?.name || "unknown.pdf",
          formPayload: pendingExtractionPayload,
          status: "EXTRACTED",
          forceNewQuote: false,
        }),
      });

      onRun(pendingExtractionPayload, uploadedFiles, "revision");
    }
  };

  const handleModalCreateNewQuote = async () => {
    setDuplicateModalOpen(false);
    await executeExtraction(true);
  };

  const handleModalCancel = () => {
    setDuplicateModalOpen(false);
    setUploadedFiles([]);
    setPendingExtractionPayload(null);
    setDuplicateData(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Input Form</h1>
        <p className="mt-1 text-base text-muted-foreground">
          Enter customer email content and upload drawings to begin extraction.
        </p>
      </div>

      <Card className="transition-colors hover:border-muted-foreground/30">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Request / Email Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="rfq-email">Paste the customer&apos;s RFQ email content</Label>
          <Textarea
            id="rfq-email"
            className="min-h-[250px]"
            value={emailText}
            onChange={(event) => setEmailText(event.target.value)}
          />
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => setEmailText("")}>
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="transition-colors hover:border-muted-foreground/30">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Upload Drawings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-surface px-6 py-10 text-center ${isDragging ? "border-primary bg-accent" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              addFiles(event.dataTransfer.files);
            }}
          >
            <Upload className="size-7 text-muted-foreground" />
            <p className="mt-3 text-base font-medium">Drop drawing files here</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload or drop files. Limit 20 MB per file. Supported: PDF, PNG, JPEG, WEBP
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files) addFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={(event) => {
                event.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              Browse files
            </Button>
          </div>
          <div className="space-y-3">
            {uploadedFiles.map((file) => (
              <div
                key={`${file.name}-${file.lastModified}`}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background p-3 transition-colors hover:border-muted-foreground/30"
              >
                <FileText className="size-5 text-muted-foreground" />
                <span className="text-base font-medium">{file.name}</span>
                <span className="text-sm text-muted-foreground">
                  {(file.size / 1024).toLocaleString(undefined, { maximumFractionDigits: 0 })} KB
                </span>
                <Badge variant="neutral">{file.name.split(".").pop()?.toUpperCase()}</Badge>
                <div className="ml-auto flex items-center gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => openFile(file)}>
                    <Eye className="size-4" /> View
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setUploadedFiles((current) => current.filter((item) => item !== file))
                    }
                  >
                    <X className="size-4" /> Remove
                  </Button>
                </div>
              </div>
            ))}
            {!uploadedFiles.length && (
              <p className="text-sm text-muted-foreground">No files selected yet.</p>
            )}
            {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          </div>
        </CardContent>
      </Card>

      <Card className="transition-colors hover:border-muted-foreground/30">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Additional Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label>Parts delivered in hand?</Label>
            <RadioGroup defaultValue="receiving" className="flex flex-wrap gap-6">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="receiving" id="in-hand-yes" />
                <Label htmlFor="in-hand-yes" className="font-normal">
                  At receiving
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="not-received" id="in-hand-no" />
                <Label htmlFor="in-hand-no" className="font-normal">
                  Not received
                </Label>
              </div>
            </RadioGroup>
          </div>
          <div className="space-y-2">
            <Label>Business Unit</Label>
            <Select
              value={selectedBU}
              onValueChange={(val) => {
                setSelectedBU(val);
                onBusinessUnitChange?.(val);
              }}
            >
              <SelectTrigger className="w-full sm:w-80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OC Custom Coating">OC Custom Coating</SelectItem>
                <SelectItem value="MAD Custom-Coating">MAD Custom-Coating</SelectItem>
                <SelectItem value="Maverick Powder Coating">Maverick Powder Coating</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="transition-colors hover:border-muted-foreground/30">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-semibold">Process the RFQ</CardTitle>
            <Badge variant="outline" className="text-xs gap-1 font-normal">
              <Sparkles className="size-3 text-primary" /> Dynamic Model Selection
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>AI Model</Label>
                {isLoadingModels ? (
                  <RefreshCw className="size-3 animate-spin text-muted-foreground" />
                ) : null}
              </div>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="w-full sm:w-96">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {models.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      <div className="flex flex-col text-left py-0.5">
                        <span className="font-medium text-sm">
                          {model.name}
                          {model.isDefault ? (
                            <span className="ml-1.5 text-xs text-primary font-bold">(Default)</span>
                          ) : null}
                        </span>
                        {model.description ? (
                          <span className="text-xs text-muted-foreground line-clamp-1 max-w-sm">
                            {model.description}
                          </span>
                        ) : null}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="lg" disabled={isExtracting} onClick={() => executeExtraction(false)}>
              {isExtracting ? "EXTRACTING..." : "RUN Extraction"} <ArrowRight className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Duplicate Warning Modal (REQ-004, Section 4.2) */}
      <DuplicateDrawingDialog
        open={duplicateModalOpen}
        onOpenChange={setDuplicateModalOpen}
        data={duplicateData}
        onCreateRevision={handleModalCreateRevision}
        onCreateNewQuote={handleModalCreateNewQuote}
        onCancel={handleModalCancel}
      />
    </div>
  );
}
