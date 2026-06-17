import { useState, useRef, useEffect, ChangeEvent, ClipboardEvent } from "react";
import {
  Upload,
  FileText,
  Printer,
  Download,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Building2,
  Calendar,
  Edit3,
  Image as ImageIcon,
} from "lucide-react";
import { parseInsuranceFileWithGemini, refineHTMLWithGemini } from "./services/geminiService";
import { buildPOIDocument } from "./utils/templateBuilder";
import { ParsedPolicyData, Lienholder } from "./types";

const POLICY_TYPE_OPTIONS = [
  { value: "auto-detect", label: "Auto-detect" },
  { value: "auto", label: "Auto" },
  { value: "home", label: "Home" },
  { value: "boat", label: "Boat" },
  { value: "motorcycle", label: "Motorcycle" },
  { value: "rental-home", label: "Rental Home" },
  { value: "renters", label: "Renters" },
  { value: "condo", label: "Condo" },
  { value: "other", label: "Other" },
] as const;

export default function App() {
  const [documentBase64, setDocumentBase64] = useState<string | null>(null);
  const [documentMimeType, setDocumentMimeType] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseInstructions, setParseInstructions] = useState("");
  const [parsedData, setParsedData] = useState<ParsedPolicyData | null>(null);
  const [status, setStatus] = useState<string>("Ready to upload");
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [previewHtml, setPreviewHtml] = useState<string>("");

  const [refinementPrompt, setRefinementPrompt] = useState("");
  const [isRefining, setIsRefining] = useState<boolean>(false);

  const [lienName, setLienName] = useState("");
  const [lienAddress, setLienAddress] = useState("");
  const [lienCityStateZip, setLienCityStateZip] = useState("");
  const [docDate, setDocDate] = useState("");
  const [policyTypeOverride, setPolicyTypeOverride] = useState<string>("auto-detect");
  const [otherPolicyTypeLabel, setOtherPolicyTypeLabel] = useState("");

  const iframeRef = useRef<HTMLIFrameElement>(null);

  const normalizedStatus = status.toLowerCase();
  const hasError = normalizedStatus.includes("error");
  const isWorking =
    normalizedStatus.includes("parsing") ||
    normalizedStatus.includes("refining") ||
    normalizedStatus.includes("reading") ||
    normalizedStatus.includes("building");
  const hasSuccess =
    !hasError &&
    !isWorking &&
    (normalizedStatus.includes("ready") ||
      normalizedStatus.includes("success") ||
      normalizedStatus.includes("loaded") ||
      normalizedStatus.includes("extracted"));

  useEffect(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yyyy = d.getFullYear();
    setDocDate(`${mm}/${dd}/${yyyy}`);
  }, []);

  const resetLoadedDocument = () => {
    setParsedData(null);
    setPreviewHtml("");
    setPolicyTypeOverride("auto-detect");
    setOtherPolicyTypeLabel("");
  };

  const loadDocumentFromFile = (file: File, displayName?: string) => {
    setFileName(displayName || file.name);
    setStatus("Reading file...");

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      const base64 = result.split(",")[1];
      setDocumentBase64(base64);
      setDocumentMimeType(file.type || "application/octet-stream");
      resetLoadedDocument();
      setStatus(
        (file.type || "").startsWith("image/")
          ? "Image loaded - ready to parse"
          : "PDF loaded - ready to parse",
      );
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    loadDocumentFromFile(file);
  };

  const handlePasteImage = (e: ClipboardEvent<HTMLDivElement>) => {
    const items = Array.from(e.clipboardData.items as DataTransferItemList);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;

    const file = imageItem.getAsFile();
    if (!file) return;

    e.preventDefault();
    loadDocumentFromFile(file, `Pasted screenshot.${file.type.split("/")[1] || "png"}`);
  };

  const handleParseAndGenerate = async () => {
    if (!documentBase64 || !documentMimeType) {
      alert("Please upload a carrier PDF or paste a screenshot first.");
      return;
    }

    if (policyTypeOverride === "other" && !otherPolicyTypeLabel.trim()) {
      alert("Enter the business or policy type when using Other.");
      return;
    }

    let data = parsedData;
    let currentLienName = lienName;
    let currentLienAddress = lienAddress;
    let currentLienCityStateZip = lienCityStateZip;

    if (!data) {
      setIsParsing(true);
      setStatus("Parsing document with Gemini AI...");

      try {
        data = await parseInsuranceFileWithGemini(documentBase64, documentMimeType, parseInstructions);
        setParsedData(data);

        if (data.lienholderName && !currentLienName) {
          currentLienName = data.lienholderName;
          setLienName(currentLienName);
        }
        if (data.lienholderAddress && !currentLienAddress) {
          currentLienAddress = data.lienholderAddress;
          setLienAddress(currentLienAddress);
        }
        if (data.lienholderCityStateZip && !currentLienCityStateZip) {
          currentLienCityStateZip = data.lienholderCityStateZip;
          setLienCityStateZip(currentLienCityStateZip);
        }

        setStatus("Data extracted - building document...");
      } catch (err: any) {
        console.error(err);
        setStatus(`Parse error: ${err.message}`);
        setIsParsing(false);
        return;
      }

      setIsParsing(false);
    }

    if (!data) return;

    const effectiveData: ParsedPolicyData =
      {
        ...data,
        policyCategory: policyTypeOverride === "auto-detect" ? data.policyCategory : policyTypeOverride,
        customPolicyLabel: policyTypeOverride === "other" ? otherPolicyTypeLabel.trim() : null,
      };

    const lienholder: Lienholder = {
      name: currentLienName.trim(),
      address: currentLienAddress.trim(),
      cityStateZip: currentLienCityStateZip.trim(),
    };

    const html = buildPOIDocument(effectiveData, lienholder, docDate);
    setPreviewHtml(html);
    setStatus("Document ready - download or print");
  };

  const handleRefine = async () => {
    if (!previewHtml || !refinementPrompt.trim()) return;

    setIsRefining(true);
    setStatus("Refining document with Gemini AI...");

    try {
      const updatedHtml = await refineHTMLWithGemini(previewHtml, refinementPrompt);
      setPreviewHtml(updatedHtml);
      setRefinementPrompt("");
      setStatus("Document refined successfully");
    } catch (err: any) {
      console.error(err);
      setStatus(`Refinement error: ${err.message}`);
    } finally {
      setIsRefining(false);
    }
  };

  const handlePrint = () => {
    if (!iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.print();
  };

  const handleDownload = () => {
    if (!previewHtml) return;
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(previewHtml);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 500);
    }
  };

  const handleDownloadHtml = () => {
    if (!previewHtml) return;
    const blob = new Blob([previewHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `POI_${parsedData?.namedInsured.replace(/\s+/g, "_") || "Document"}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 font-sans text-gray-900 md:p-8">
      <div className="mx-auto grid h-[calc(100vh-4rem)] max-w-7xl grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex h-full flex-col overflow-y-auto rounded-xl bg-white p-6 shadow-md">
          <div className="mb-6 border-b pb-4">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-blue-900">
              <Building2 className="h-6 w-6" />
              Bill Layne Insurance
            </h1>
            <p className="mt-1 text-sm text-gray-500">Automated Proof of Insurance Generator</p>
          </div>

          <div className="flex-1 space-y-6">
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
              <label className="mb-2 flex items-center gap-2 text-sm font-bold text-blue-900">
                <FileText className="h-4 w-4" />
                1. Upload PDF or Image
              </label>
              <div className="flex items-center gap-3">
                <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded border border-blue-300 bg-white px-4 py-2 text-blue-700 transition-colors hover:bg-blue-50">
                  <Upload className="h-4 w-4" />
                  {fileName ? "Change File" : "Choose PDF or Image"}
                  <input
                    type="file"
                    accept="application/pdf,image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </label>
              </div>
              <div
                onPaste={handlePasteImage}
                className="mt-3 rounded border border-dashed border-blue-300 bg-white px-4 py-3 text-sm text-blue-800"
                tabIndex={0}
              >
                <div className="flex items-center gap-2 font-medium">
                  <ImageIcon className="h-4 w-4" />
                  Paste screenshot here
                </div>
                <p className="mt-1 text-xs text-blue-700">
                  Click this box and press Ctrl+V after taking a screenshot from a policy screen.
                </p>
              </div>
              {fileName && (
                <div className="mt-2 flex items-center gap-1 text-sm text-gray-600">
                  <CheckCircle className="h-3 w-3 text-green-600" />
                  {fileName}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-amber-100 bg-amber-50 p-4">
              <label className="mb-3 flex items-center gap-2 text-sm font-bold text-amber-900">
                <Building2 className="h-4 w-4" />
                2. Lienholder (Optional)
              </label>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-amber-800">Name</label>
                  <input
                    type="text"
                    value={lienName}
                    onChange={(e) => setLienName(e.target.value)}
                    className="w-full rounded border border-amber-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="e.g. Medallion Bank"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-amber-800">
                    Address & Details (ISAOA, Loan #)
                  </label>
                  <textarea
                    value={lienAddress}
                    onChange={(e) => setLienAddress(e.target.value)}
                    className="h-auto w-full resize-none rounded border border-amber-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="e.g. ISAOA / ATIMA&#10;P.O. Box 202070&#10;Loan #: 123456789"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-amber-800">City / State / Zip</label>
                  <input
                    type="text"
                    value={lienCityStateZip}
                    onChange={(e) => setLienCityStateZip(e.target.value)}
                    className="w-full rounded border border-amber-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="e.g. Salt Lake City, UT 84121"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <label className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-700">
                <Calendar className="h-4 w-4" />
                3. Date Override
              </label>
              <input
                type="text"
                value={docDate}
                onChange={(e) => setDocDate(e.target.value)}
                className="w-full rounded border border-gray-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="MM/DD/YYYY"
              />
            </div>

            <div className="rounded-lg border border-teal-100 bg-teal-50 p-4">
              <label className="mb-2 flex items-center gap-2 text-sm font-bold text-teal-900">
                <Edit3 className="h-4 w-4" />
                4. Parse Notes / Additions
              </label>
              <textarea
                value={parseInstructions}
                onChange={(e) => setParseInstructions(e.target.value)}
                className="h-auto w-full resize-none rounded border border-teal-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="Examples: Use vehicle 3 only. Build proof for car 2. Ignore the boat. Use the home policy only. Include the motorcycle listed on page 2."
                rows={3}
              />
              <p className="mt-2 text-xs text-teal-800">
                These notes are sent to AI before parsing so you can guide which vehicle, property, or risk to use.
              </p>
            </div>

            <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-4">
              <label className="mb-2 flex items-center gap-2 text-sm font-bold text-indigo-900">
                <Building2 className="h-4 w-4" />
                5. Policy Type
              </label>
              <select
                value={policyTypeOverride}
                onChange={(e) => setPolicyTypeOverride(e.target.value)}
                className="w-full rounded border border-indigo-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {POLICY_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-indigo-800">
                Leave on auto-detect for normal use, or choose a type to override the AI classification.
              </p>
              {policyTypeOverride === "other" && (
                <div className="mt-3">
                  <label className="mb-1 block text-xs font-semibold text-indigo-800">
                    Business / Policy Type
                  </label>
                  <input
                    type="text"
                    value={otherPolicyTypeLabel}
                    onChange={(e) => setOtherPolicyTypeLabel(e.target.value)}
                    className="w-full rounded border border-indigo-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. General Liability, Commercial Property, Business Auto"
                  />
                </div>
              )}
            </div>

            <button
              onClick={handleParseAndGenerate}
              disabled={!documentBase64 || isParsing}
              className={`flex w-full items-center justify-center gap-2 rounded-lg py-4 text-lg font-bold text-white shadow-md transition-all ${
                !documentBase64
                  ? "cursor-not-allowed bg-gray-400"
                  : isParsing
                    ? "cursor-wait bg-blue-400"
                    : "bg-blue-700 hover:bg-blue-800 hover:shadow-lg"
              }`}
            >
              {isParsing ? (
                <>
                  <RefreshCw className="h-5 w-5 animate-spin" />
                  Parsing Document...
                </>
              ) : (
                <>
                  <RefreshCw className="h-5 w-5" />
                  {parsedData ? "Update Document" : "Parse & Generate"}
                </>
              )}
            </button>

            <div
              className={`flex items-center gap-2 rounded-lg p-3 text-sm font-medium ${
                hasError
                  ? "bg-red-100 text-red-800"
                  : hasSuccess
                    ? "bg-green-100 text-green-800"
                    : "bg-gray-100 text-gray-700"
              }`}
            >
              {hasError && <AlertCircle className="h-4 w-4" />}
              {hasSuccess && <CheckCircle className="h-4 w-4" />}
              {isWorking && <RefreshCw className="h-4 w-4 animate-spin" />}
              {status}
            </div>
          </div>
        </div>

        <div className="flex h-full flex-col rounded-xl bg-white p-6 shadow-md">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-800">Document Preview</h2>
            <div className="flex gap-2">
              <button
                onClick={handleDownloadHtml}
                disabled={!previewHtml}
                className="flex items-center gap-2 rounded bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                <FileText className="h-4 w-4" />
                Download HTML
              </button>
              <button
                onClick={handleDownload}
                disabled={!previewHtml}
                className="flex items-center gap-2 rounded bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                Download PDF
              </button>
              <button
                onClick={handlePrint}
                disabled={!previewHtml}
                className="flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Printer className="h-4 w-4" />
                Print
              </button>
            </div>
          </div>

          <div className="relative flex-1 overflow-hidden rounded-lg border border-gray-300 bg-gray-200">
            {!previewHtml ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                <FileText className="mb-4 h-16 w-16 opacity-20" />
                <p>Document preview will appear here</p>
              </div>
            ) : (
              <iframe ref={iframeRef} srcDoc={previewHtml} className="h-full w-full bg-white" title="Preview" />
            )}
          </div>

          {previewHtml && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <label className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-700">
                <Edit3 className="h-4 w-4" />
                Refine Document
              </label>
              <textarea
                value={refinementPrompt}
                onChange={(e) => setRefinementPrompt(e.target.value)}
                placeholder="e.g., Make the font smaller, add towing coverage for $15..."
                className="mb-3 h-20 w-full resize-none rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleRefine}
                disabled={isRefining || !refinementPrompt.trim()}
                className={`flex w-full items-center justify-center gap-2 rounded py-2 font-bold text-white transition-all ${
                  isRefining || !refinementPrompt.trim()
                    ? "cursor-not-allowed bg-gray-400"
                    : "bg-indigo-600 hover:bg-indigo-700"
                }`}
              >
                {isRefining ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Refining...
                  </>
                ) : (
                  <>
                    <Edit3 className="h-4 w-4" />
                    Apply Changes
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
