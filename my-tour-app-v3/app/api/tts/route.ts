// app/api/tts/route.ts
// Edge TTS - Microsoft, miễn phí, không cần API key
// Voice list: https://speech.microsoft.com/portal/voicegallery

import { NextRequest, NextResponse } from "next/server";

// Giọng đọc theo ngôn ngữ
const VOICES: Record<string, string> = {
  vi: "vi-VN-HoaiMyNeural",   // Nữ, tự nhiên nhất
  en: "en-US-JennyNeural",    // Nữ, tự nhiên nhất
};

// Lấy token từ Edge TTS
async function getEdgeToken(): Promise<string> {
  const res = await fetch(
    "https://www.bing.com/tfspokenapi/tts/client/token",
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    }
  );
  const data = await res.json();
  return data.token;
}

export async function POST(req: NextRequest) {
  try {
    const { text, language = "vi" } = await req.json();

    if (!text) {
      return NextResponse.json({ error: "No text" }, { status: 400 });
    }

    const voice = VOICES[language] || VOICES.vi;
    const token = await getEdgeToken();

    // Build SSML
    const ssml = `
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${language === "vi" ? "vi-VN" : "en-US"}">
  <voice name="${voice}">
    <prosody rate="0%" pitch="0%">
      ${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}
    </prosody>
  </voice>
</speak>`.trim();

    // Gọi Edge TTS
    const ttsRes = await fetch(
      `https://eastus.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
          "User-Agent": "Mozilla/5.0",
        },
        body: ssml,
      }
    );

    if (!ttsRes.ok) {
      throw new Error(`Edge TTS error: ${ttsRes.status}`);
    }

    const audioBuffer = await ttsRes.arrayBuffer();

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache",
      },
    });

  } catch (error: any) {
    console.error("TTS Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
