// app/api/tts/route.ts
import { NextRequest, NextResponse } from "next/server";

const VOICES: Record<string, string> = {
  vi: "vi-VN-HoaiMyNeural",
  en: "en-US-JennyNeural",
};

function randomHex(length: number): string {
  return Array.from({ length }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
}

export async function POST(req: NextRequest) {
  try {
    const { text, language = "vi" } = await req.json();
    if (!text) return NextResponse.json({ error: "No text" }, { status: 400 });

    const voice = VOICES[language] || VOICES.vi;
    const lang = language === "vi" ? "vi-VN" : "en-US";
    const safeText = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'><voice name='${voice}'><prosody rate='0%' pitch='0%'>${safeText}</prosody></voice></speak>`;

    // ── Thử 1: trafficmanager (không cần token) ──
    try {
      const r1 = await fetch(
        "https://tts.trafficmanager.net/cognitiveservices/v1?TrafficType=AzureDemo",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
            "User-Agent": "Mozilla/5.0",
            "Origin": "https://azure.microsoft.com",
            "Referer": "https://azure.microsoft.com/",
            "X-RequestId": randomHex(32).toUpperCase(),
          },
          body: ssml,
        }
      );
      if (r1.ok) {
        const buf = await r1.arrayBuffer();
        if (buf.byteLength > 0) {
          return new NextResponse(buf, {
            headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-cache" },
          });
        }
      }
    } catch { /* thử tiếp */ }

    // ── Thử 2: Google Translate TTS (miễn phí, không cần key) ──
    try {
      const gl = language === "vi" ? "vi" : "en";
      const encoded = encodeURIComponent(text.slice(0, 200));
      const r2 = await fetch(
        `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=${gl}&client=tw-ob`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://translate.google.com/",
          },
        }
      );
      if (r2.ok) {
        const buf = await r2.arrayBuffer();
        if (buf.byteLength > 0) {
          return new NextResponse(buf, {
            headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-cache" },
          });
        }
      }
    } catch { /* thử tiếp */ }

    // ── Thử 3: VoiceRSS miễn phí (giới hạn 350 req/ngày) ──
    try {
      const vLang = language === "vi" ? "vi-vn" : "en-us";
      const r3 = await fetch(
        `https://api.voicerss.org/?key=demo&hl=${vLang}&src=${encodeURIComponent(text.slice(0, 100))}&f=48khz_16bit_mono&c=MP3`
      );
      if (r3.ok) {
        const buf = await r3.arrayBuffer();
        if (buf.byteLength > 0) {
          return new NextResponse(buf, {
            headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-cache" },
          });
        }
      }
    } catch { /* hết options */ }

    return NextResponse.json({ error: "All TTS providers failed" }, { status: 500 });

  } catch (error: any) {
    console.error("TTS Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
