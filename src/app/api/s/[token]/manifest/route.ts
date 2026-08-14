import { NextResponse } from "next/server";

// Per-token manifest so installing the PWA from a shared link launches
// straight into that link (Android/Chrome use manifest start_url; iOS
// Safari ignores it and just bookmarks the current URL instead).
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const scope = `/s/${token}`;

  return NextResponse.json(
    {
      name: "Sunwalks",
      short_name: "Sunwalks",
      description: "Every day square is the sunrise photo you were out for that morning.",
      start_url: `${scope}?source=pwa`,
      scope,
      display: "standalone",
      background_color: "#f5ead8",
      theme_color: "#f5ead8",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        {
          src: "/icons/icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
