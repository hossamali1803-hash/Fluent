import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// Serves pdfjs-dist worker — tries several possible paths
export async function GET() {
  const base = join(process.cwd(), "node_modules/pdfjs-dist");
  const candidates = [
    join(base, "build/pdf.worker.min.mjs"),
    join(base, "build/pdf.worker.mjs"),
    join(base, "build/pdf.worker.min.js"),
    join(base, "build/pdf.worker.js"),
    join(base, "legacy/build/pdf.worker.min.js"),
    join(base, "legacy/build/pdf.worker.js"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      const content = readFileSync(p);
      const isModule = p.endsWith(".mjs");
      return new NextResponse(content, {
        headers: {
          "Content-Type": isModule ? "text/javascript" : "application/javascript",
          "Cache-Control": "public, max-age=86400",
        },
      });
    }
  }
  return new NextResponse("Worker not found", { status: 404 });
}
