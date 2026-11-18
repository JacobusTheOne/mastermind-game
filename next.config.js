/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: the whole app runs in the browser and is served from
  // Amplify Hosting's CDN (no server-side rendering compute needed).
  output: "export",
  images: { unoptimized: true },
};

module.exports = nextConfig;
