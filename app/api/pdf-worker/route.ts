import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

// Serves pdfjs-dist worker from node_modules so the version always matches
export async function GET() {
  try {
    const workerPath = join(
      process.cwd(),
      "node_modules/pdfjs-dist/build/pdf.worker.min.mjs"
    );
    const content = readFileSync(workerPath);
    return new NextResponse(content, {
      headers: {
        "Content-Type": "application/javascript",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
