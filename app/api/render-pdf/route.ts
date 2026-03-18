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

    let canvas: any;
    let createCanvas: any;
    try {
      ({ createCanvas } = require("@napi-rs/canvas"));
    } catch (e) {
      return NextResponse.json({ error: `canvas load failed: ${e}` }, { status: 500 });
    }

    let pdfjsLib: any;
    try {
      pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
    } catch (e) {
      return NextResponse.json({ error: `pdfjs load failed: ${e}` }, { status: 500 });
    }

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
      const scale = Math.min(1280 / vp0.width, 1280 / vp0.height, 2);
      const viewport = page.getViewport({ scale });

      canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;

      const buffer = canvas.toBuffer("image/jpeg", 85);
      images.push(buffer.toString("base64"));
    }

    return NextResponse.json({ images });
  } catch (err) {
    console.error("[render-pdf]", err);
    // Return actual error so client can display it for debugging
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
