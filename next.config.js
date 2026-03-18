/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent webpack from trying to bundle native server-only modules
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"],
};
module.exports = nextConfig;
