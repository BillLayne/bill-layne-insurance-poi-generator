import { useState, useRef, useEffect, ChangeEvent } from "react";
import { Upload, FileText, Printer, Download, RefreshCw, CheckCircle, AlertCircle, Building2, Calendar, Edit3 } from "lucide-react";
import { parsePDFWithGemini, refineHTMLWithGemini } from "./services/geminiService";
import { buildPOIDocument } from "./utils/templateBuilder";
import { ParsedPolicyData, Lienholder } from "./types";

export default function App() {
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<ParsedPolicyData | null>(null);
  const [status, setStatus] = useState<string>("Ready to upload");
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  
  // Refinement states
  const [refinementPrompt, setRefinementPrompt] = useState("");
  const [isRefining, setIsRefining] = useState<boolean>(false);
  
  // Form states
  const [lienName, setLienName] = useState("");
  const [lienAddress, setLienAddress] = useState("");
  const [lienCityStateZip, setLienCityStateZip] = useState("");
  const [docDate, setDocDate] = useState("");

  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Set today's date formatted as MM/DD/YYYY
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yyyy = d.getFullYear();
    setDocDate(`${mm}/${dd}/${yyyy}`);
  }, []);

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setStatus("Reading file...");
    
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      // Strip the data URL prefix to get raw base64
      const base64 = result.split(",")[1];
      setPdfBase64(base64);
      setParsedData(null); // Clear previous parse
      setPreviewHtml("");
      setStatus("✅ PDF loaded — Ready to Parse");
    };
    reader.readAsDataURL(file);
  };

  const handleParseAndGenerate = async () => {
    if (!pdfBase64) {
      alert("Please upload a carrier PDF first.");
      return;
    }

    let data = parsedData;

    let currentLienName = lienName;
    let currentLienAddress = lienAddress;
    let currentLienCityStateZip = lienCityStateZip;

    // Only parse if we haven't already, or if we want to force re-parse (could add a flag for that)
    // For now, if we have parsedData, we just regenerate the HTML with new form values
    if (!data) {
      setIsParsing(true);
      setStatus("🔄 Parsing PDF with Gemini AI...");
      try {
        data = await parsePDFWithGemini(pdfBase64);
        setParsedData(data);
        
        // Auto-fill lienholder fields if they were found in the PDF and the user hasn't manually entered them
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

        setStatus("✅ Data extracted — building document...");
      } catch (err: any) {
        console.error(err);
        setStatus(`❌ Parse error: ${err.message}`);
        setIsParsing(false);
        return;
      }
      setIsParsing(false);
    }

    if (!data) return;

    const lienholder: Lienholder = {
      name: currentLienName.trim(),
      address: currentLienAddress.trim(),
      cityStateZip: currentLienCityStateZip.trim(),
    };

    const html = buildPOIDocument(data, lienholder, docDate);
    setPreviewHtml(html);
    setStatus("✅ Document ready — Download or Print");
  };

  const handleRefine = async () => {
    if (!previewHtml || !refinementPrompt.trim()) return;

    setIsRefining(true);
    setStatus("🔄 Refining document with Gemini AI...");
    try {
      const updatedHtml = await refineHTMLWithGemini(previewHtml, refinementPrompt);
      setPreviewHtml(updatedHtml);
      setRefinementPrompt("");
      setStatus("✅ Document refined successfully");
    } catch (err: any) {
      console.error(err);
      setStatus(`❌ Refinement error: ${err.message}`);
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
    <div className="min-h-screen bg-gray-100 p-4 md:p-8 font-sans text-gray-900">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-4rem)]">
        
        {/* LEFT PANEL - Controls */}
        <div className="bg-white rounded-xl shadow-md p-6 flex flex-col h-full overflow-y-auto">
          <div className="mb-6 border-b pb-4">
            <h1 className="text-2xl font-bold text-blue-900 flex items-center gap-2">
              <Building2 className="w-6 h-6" />
              Bill Layne Insurance
            </h1>
            <p className="text-sm text-gray-500 mt-1">Automated Proof of Insurance Generator</p>
          </div>

          <div className="space-y-6 flex-1">
            {/* Upload Section */}
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
              <label className="block text-sm font-bold text-blue-900 mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                1. Upload Carrier PDF
              </label>
              <div className="flex items-center gap-3">
                <label className="flex-1 cursor-pointer bg-white border border-blue-300 text-blue-700 px-4 py-2 rounded hover:bg-blue-50 transition-colors flex items-center justify-center gap-2">
                  <Upload className="w-4 h-4" />
                  {fileName ? "Change File" : "Choose PDF File"}
                  <input 
                    type="file" 
                    accept="application/pdf" 
                    className="hidden" 
                    onChange={handleFileUpload}
                  />
                </label>
              </div>
              {fileName && (
                <div className="mt-2 text-sm text-gray-600 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-green-600" />
                  {fileName}
                </div>
              )}
            </div>

            {/* Lienholder Section */}
            <div className="bg-amber-50 p-4 rounded-lg border border-amber-100">
              <label className="block text-sm font-bold text-amber-900 mb-3 flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                2. Lienholder (Optional)
              </label>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-amber-800 mb-1">Name</label>
                  <input
                    type="text"
                    value={lienName}
                    onChange={(e) => setLienName(e.target.value)}
                    className="w-full px-3 py-2 border border-amber-200 rounded focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                    placeholder="e.g. Medallion Bank"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-amber-800 mb-1">Address & Details (ISAOA, Loan #)</label>
                  <textarea
                    value={lienAddress}
                    onChange={(e) => setLienAddress(e.target.value)}
                    className="w-full px-3 py-2 border border-amber-200 rounded focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white resize-none"
                    placeholder="e.g. ISAOA / ATIMA&#10;P.O. Box 202070&#10;Loan #: 123456789"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-amber-800 mb-1">City / State / Zip</label>
                  <input
                    type="text"
                    value={lienCityStateZip}
                    onChange={(e) => setLienCityStateZip(e.target.value)}
                    className="w-full px-3 py-2 border border-amber-200 rounded focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                    placeholder="e.g. Salt Lake City, UT 84121"
                  />
                </div>
              </div>
            </div>

            {/* Date Override */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                3. Date Override
              </label>
              <input
                type="text"
                value={docDate}
                onChange={(e) => setDocDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                placeholder="MM/DD/YYYY"
              />
            </div>

            {/* Action Button */}
            <button
              onClick={handleParseAndGenerate}
              disabled={!pdfBase64 || isParsing}
              className={`w-full py-4 rounded-lg font-bold text-white text-lg shadow-md transition-all flex items-center justify-center gap-2
                ${!pdfBase64 
                  ? "bg-gray-400 cursor-not-allowed" 
                  : isParsing 
                    ? "bg-blue-400 cursor-wait" 
                    : "bg-blue-700 hover:bg-blue-800 hover:shadow-lg"
                }`}
            >
              {isParsing ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Parsing PDF...
                </>
              ) : (
                <>
                  <RefreshCw className="w-5 h-5" />
                  {parsedData ? "Update Document" : "Parse & Generate"}
                </>
              )}
            </button>

            {/* Status */}
            <div className={`p-3 rounded-lg text-sm font-medium flex items-center gap-2
              ${status.includes("❌") ? "bg-red-100 text-red-800" : 
                status.includes("✅") ? "bg-green-100 text-green-800" : 
                "bg-gray-100 text-gray-700"}`}>
              {status.includes("❌") && <AlertCircle className="w-4 h-4" />}
              {status.includes("✅") && <CheckCircle className="w-4 h-4" />}
              {status.includes("🔄") && <RefreshCw className="w-4 h-4 animate-spin" />}
              {status}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL - Preview */}
        <div className="bg-white rounded-xl shadow-md p-6 flex flex-col h-full">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-800">Document Preview</h2>
            <div className="flex gap-2">
              <button
                onClick={handleDownloadHtml}
                disabled={!previewHtml}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
              >
                <FileText className="w-4 h-4" />
                Download HTML
              </button>
              <button
                onClick={handleDownload}
                disabled={!previewHtml}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
              >
                <Download className="w-4 h-4" />
                Download PDF
              </button>
              <button
                onClick={handlePrint}
                disabled={!previewHtml}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
              >
                <Printer className="w-4 h-4" />
                Print
              </button>
            </div>
          </div>

          <div className="flex-1 bg-gray-200 rounded-lg overflow-hidden border border-gray-300 relative">
            {!previewHtml ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                <FileText className="w-16 h-16 mb-4 opacity-20" />
                <p>Document preview will appear here</p>
              </div>
            ) : (
              <iframe
                ref={iframeRef}
                srcDoc={previewHtml}
                className="w-full h-full bg-white"
                title="Preview"
              />
            )}
          </div>

          {/* Refinement Section */}
          {previewHtml && (
            <div className="mt-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
              <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                <Edit3 className="w-4 h-4" />
                Refine Document
              </label>
              <textarea
                value={refinementPrompt}
                onChange={(e) => setRefinementPrompt(e.target.value)}
                placeholder="e.g., Make the font smaller, add towing coverage for $15..."
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white resize-none h-20 mb-3 text-sm"
              />
              <button
                onClick={handleRefine}
                disabled={isRefining || !refinementPrompt.trim()}
                className={`w-full py-2 rounded font-bold text-white transition-all flex items-center justify-center gap-2
                  ${isRefining || !refinementPrompt.trim()
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-700"
                  }`}
              >
                {isRefining ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Refining...
                  </>
                ) : (
                  <>
                    <Edit3 className="w-4 h-4" />
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
