import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("pdf") as File | null;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    // pdfjs-dist runs in Node.js — no web worker needed on the server
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.js" as any);
    const { createCanvas } = await import("@napi-rs/canvas");

    const pdf = await pdfjsLib.getDocument({
      data,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;

    const images: string[] = [];

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const vp0 = page.getViewport({ scale: 1 });
      // Scale to max 1280px wide, good balance of quality vs size
      const scale = Math.min(1280 / vp0.width, 1280 / vp0.height, 2);
      const viewport = page.getViewport({ scale });

      const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
      const ctx = canvas.getContext("2d");

      await page.render({ canvasContext: ctx as any, viewport }).promise;

      const buffer = canvas.toBuffer("image/jpeg", 85);
      images.push(buffer.toString("base64"));
    }

    return NextResponse.json({ images });
  } catch (err) {
    console.error("[render-pdf]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
