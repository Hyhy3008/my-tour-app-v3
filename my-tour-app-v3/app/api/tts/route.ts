import { NextRequest, NextResponse } from "next/server";

const VOICES: Record<string, string> = {
  vi: "vi-VN-HoaiMyNeural",
  en: "en-US-JennyNeural",
  ko: "ko-KR-SunHiNeural",
  zh: "zh-CN-XiaoxiaoNeural",
};

function randomHex(length: number): string {
  return Array.from({ length }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
}

function concatBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const total = buffers.reduce((sum, b) => sum + b.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const buf of buffers) {
    result.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }
  return result.buffer;
}

function splitText(text: string, maxLen = 180): string[] {
  const sentences = text
    .split(/(?<=[.!?\n。！？])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if ((current + " " + sentence).trim().length <= maxLen) {
      current = (current + " " + sentence).trim();
    } else {
      if (current) chunks.push(current);
      if (sentence.length > maxLen) {
        for (let i = 0; i < sentence.length; i += maxLen) {
          chunks.push(sentence.slice(i, i + maxLen));
        }
        current = "";
      } else {
        current = sentence;
      }
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function getGoogleLang(language: string) {
  switch (language) {
    case 'en':
      return 'en';
    case 'ko':
      return 'ko';
    case 'zh':
      return 'zh-CN';
    case 'vi':
    default:
      return 'vi';
  }
}

function getXmlLang(language: string) {
  switch (language) {
    case 'en':
      return 'en-US';
    case 'ko':
      return 'ko-KR';
    case 'zh':
      return 'zh-CN';
    case 'vi':
    default:
      return 'vi-VN';
  }
}

async function googleTTSChunk(chunk: string, lang: string): Promise<ArrayBuffer | null> {
  try {
    const gl = getGoogleLang(lang);
    const encoded = encodeURIComponent(chunk);

    const r = await fetch(
      `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=${gl}&client=tw-ob`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": "https://translate.google.com/",
        },
      }
    );

    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    return buf.byteLength > 0 ? buf : null;
  } catch {
    return null;
  }
}

async function edgeTTS(text: string, voice: string, lang: string): Promise<ArrayBuffer | null> {
  try {
    const safeText = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${getXmlLang(lang)}'><voice name='${voice}'><prosody rate='0%' pitch='0%'>${safeText}</prosody></voice></speak>`;

    const r = await fetch(
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

    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    return buf.byteLength > 0 ? buf : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { text, language = "vi" } = await req.json();

    if (!text) {
      return NextResponse.json({ error: "No text" }, { status: 400 });
    }

    const voice = VOICES[language] || VOICES.vi;

    // Ưu tiên Edge TTS
    const edgeBuf = await edgeTTS(text, voice, language);
    if (edgeBuf) {
      return new NextResponse(edgeBuf, {
        headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-cache" },
      });
    }

    // Fallback Google TTS
    const chunks = splitText(text, 180);
    console.log(`Google TTS fallback: ${chunks.length} chunks, lang=${language}`);

    const buffers: ArrayBuffer[] = [];
    for (const chunk of chunks) {
      const buf = await googleTTSChunk(chunk, language);
      if (buf) buffers.push(buf);
    }

    if (buffers.length > 0) {
      const merged = concatBuffers(buffers);
      return new NextResponse(merged, {
        headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-cache" },
      });
    }

    return NextResponse.json({ error: "All TTS providers failed" }, { status: 500 });
  } catch (error: any) {
    console.error("TTS Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
