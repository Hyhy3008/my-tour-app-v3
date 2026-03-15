// 1. Thêm vào package.json → dependencies:
// "@xenova/transformers": "^2.17.2"

// 2. Sửa next.config.mjs để support Xenova:

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // ✅ Cần thiết cho @xenova/transformers
  experimental: {
    serverComponentsExternalPackages: ["@xenova/transformers"],
  },

  webpack: (config) => {
    // Tắt canvas (không cần cho server)
    config.resolve.alias = {
      ...config.resolve.alias,
      sharp$: false,
      "onnxruntime-node$": false,
    };
    return config;
  },

  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
