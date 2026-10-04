"use client";

import { Camera, CheckCircle2, FileImage, LoaderCircle, WandSparkles } from "lucide-react";
import { ChangeEvent, useState } from "react";

type BookMetadata = {
  title: string;
  author: string;
  category: string;
  isbn: string;
  publisher?: string;
  publishedYear?: string;
};

type OCRBookCaptureProps = {
  onFillBook: (book: BookMetadata) => void;
};

export function OCRBookCapture({ onFillBook }: OCRBookCaptureProps) {
  const [isbn, setIsbn] = useState("");
  const [fileName, setFileName] = useState("");
  const [coverImageDataUrl, setCoverImageDataUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) {
      return;
    }

    const fileReader = new FileReader();
    fileReader.onload = () => {
      const result = typeof fileReader.result === "string" ? fileReader.result : "";
      setCoverImageDataUrl(result);
      setFileName(selectedFile.name);
      if (!isbn.trim()) {
        const numbers = selectedFile.name.match(/97[0-9][0-9Xx\- ]{10,17}/g)?.[0] ?? "";
        if (numbers) {
          setIsbn(numbers.replace(/[^0-9Xx]/g, ""));
        }
      }
    };
    fileReader.readAsDataURL(selectedFile);
  };

  async function handleScan() {
    const cleanIsbn = isbn.trim();
    if (!cleanIsbn && !coverImageDataUrl) {
      setMessage("Enter an ISBN or upload a cover image to scan metadata.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/books/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isbn: cleanIsbn,
          fileName,
          coverImageDataUrl: coverImageDataUrl || undefined,
        }),
      });

      const data = (await response.json()) as { error?: string; book?: BookMetadata };
      if (!response.ok || !data.book) {
        throw new Error(data.error ?? "OCR look-up failed.");
      }

      onFillBook(data.book);
      setMessage("Metadata auto-filled from ISBN scan.");
      setIsbn(data.book.isbn);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not recognize the book metadata.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-dashed border-brand-primary/30 bg-brand-secondary/30 p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-xl bg-brand-primary text-white">
          <Camera className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-stone-900">OCR ISBN cataloging</p>
          <p className="text-xs text-stone-500">Scan an ISBN or upload a cover image to auto-fill the form.</p>
        </div>
      </div>

      <div className="space-y-3">
        <label className="block text-xs font-medium text-stone-700">
          ISBN / barcode
          <input
            value={isbn}
            onChange={(event) => setIsbn(event.target.value)}
            className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-primary"
            placeholder="9781234567890"
          />
        </label>

        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-700">
          <span className="inline-flex items-center gap-2">
            <FileImage className="h-4 w-4 text-brand-primary" />
            {fileName ? fileName : "Upload cover image"}
          </span>
          <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </label>

        <button
          type="button"
          onClick={handleScan}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
          {loading ? "Scanning metadata..." : "Scan ISBN metadata"}
        </button>
      </div>

      {message ? (
        <div
          className={`mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
            message.includes("failed") || message.includes("Could not") ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          <CheckCircle2 className="h-4 w-4" />
          <span>{message}</span>
        </div>
      ) : null}
    </div>
  );
}
