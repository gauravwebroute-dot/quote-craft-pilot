import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useRef, useState } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Upload, X, ArrowRight, Eye } from "lucide-react";

const emailBody = `Hi,
Could we please get pricing for the attached items? The qty will be 6 each.
Thanks,
John
ABC Company
714-555-1212`;

export type ExtractionPart = {
  partNumber: string | null;
  partName: string | null;
  revision: string | null;
  isAssembly: boolean | null;
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
  totalSurfaceAreaSqIn: number | null;
  coatingAreaSqIn: number | null;
  maskingAreaSqIn: number | null;
  areaConfidence: "HIGH" | "MEDIUM" | "LOW" | null;
  coatingBom: Record<string, string | null>;
  sourceDrawingFile: string | null;
};

export type ExtractionResult = {
  customer: Record<string, string | null>;
  parts: ExtractionPart[];
  extractionNotes: string[];
};

export function SectionInput({ onRun }: { onRun: (extraction: ExtractionResult) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [emailText, setEmailText] = useState(emailBody);
  const [selectedModel, setSelectedModel] = useState("google/gemini-2.0-flash-001");
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = (selectedFiles: FileList | File[]) => {
    const validFiles = Array.from(selectedFiles).filter(
      (file) =>
        ["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(file.type) &&
        file.size <= 20 * 1024 * 1024,
    );
    setUploadedFiles((current) => [...current, ...validFiles].slice(0, 10));
  };

  const openFile = (file: File) => {
    window.open(URL.createObjectURL(file), "_blank", "noopener,noreferrer");
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
            <Select defaultValue="mad">
              <SelectTrigger className="w-full sm:w-80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="maverick">Maverick Powder Coating</SelectItem>
                <SelectItem value="oc">OC Custom Coating</SelectItem>
                <SelectItem value="mad">MAD Custom-Coating</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="transition-colors hover:border-muted-foreground/30">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Process the RFQ</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-2">
              <Label>AI Model</Label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="w-full sm:w-80">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="google/gemini-2.0-flash-001">
                    <span className="font-medium">Gemini 2.0 Flash</span>{" "}
                    <span className="text-xs text-muted-foreground">(Default • Fast & Free)</span>
                  </SelectItem>
                  <SelectItem value="anthropic/claude-3.5-sonnet">
                    <span className="font-medium">Claude 3.5 Sonnet</span>{" "}
                    <span className="text-xs text-muted-foreground">(Precision Blueprints)</span>
                  </SelectItem>
                  <SelectItem value="meta-llama/llama-3.2-11b-vision-instruct">
                    <span className="font-medium">Llama 3.2 Vision (Groq)</span>{" "}
                    <span className="text-xs text-muted-foreground">(Ultra-fast)</span>
                  </SelectItem>
                  <SelectItem value="google/gemini-1.5-pro">
                    <span className="font-medium">Gemini 1.5 Pro</span>{" "}
                    <span className="text-xs text-muted-foreground">(Deep Reasoning)</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              size="lg"
              disabled={isExtracting}
              onClick={async () => {
                setError(null);
                setIsExtracting(true);
                try {
                  const formData = new FormData();
                  uploadedFiles.forEach((file) => formData.append("files", file));
                  if (emailText.trim()) formData.append("emailText", emailText.trim());
                  formData.append("model", selectedModel);
                  const apiUrl = (
                    import.meta.env["VITE_EXTRACTION_API_URL"] ||
                    (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
                      ? "http://localhost:4000"
                      : "https://quote-craft-pilot.onrender.com")
                  ).replace(/\/$/, "");
                  const response = await fetch(`${apiUrl}/api/extract`, {
                    method: "POST",
                    body: formData,
                  });
                  const payload = await response.json();
                  if (!response.ok) throw new Error(payload.message || "Extraction failed.");
                  onRun(payload.extraction);
                } catch (requestError) {
                  setError(
                    requestError instanceof TypeError
                      ? "Unable to connect to the extraction service. Please try again or contact support."
                      : requestError instanceof Error
                        ? requestError.message
                        : "Extraction failed.",
                  );
                } finally {
                  setIsExtracting(false);
                }
              }}
            >
              {isExtracting ? "EXTRACTING..." : "RUN Extraction"} <ArrowRight className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
