import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

// ============================================
// GET - Test API
// ============================================
export async function GET() {
  const hasKey = !!process.env.GEMINI_API_KEY;
  return NextResponse.json({ 
    status: 'OK',
    hasGeminiKey: hasKey,
    model: 'gemini-3.1-flash-lite',
    thinkingLevel: 'minimal'
  });
}

// ============================================
// POST - Gọi AI với Gemini 3.1 Flash-Lite
// ============================================
export async function POST(req: Request) {
  try {
    const { contextPrompt, language = 'vi' } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "No API Key" }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // ✅ FIX: Sử dụng Gemini 3.1 Flash-Lite
    const model = genAI.getGenerativeModel({ 
      model: "gemini-3.1-flash-lite",
      // ✅ Thêm generationConfig với thinking_level
      generationConfig: {
        thinking_level: "minimal", // minimal | low | medium
      }
    });

    const prompt = language === 'en' 
      ? `You are a friendly tour guide in Vietnam for international tourists. Reply in English, short (3-4 sentences), fun and informative with emojis.\n\n${contextPrompt}`
      : `Bạn là hướng dẫn viên du lịch thân thiện. Trả lời ngắn gọn (3-4 câu), vui vẻ, có emoji.\n\n${contextPrompt}`;

    console.log('Calling Gemini 3.1 Flash-Lite with minimal thinking...');
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    console.log('✅ Success');

    return NextResponse.json({ reply: text });
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    
    // Nếu model mới chưa available, log chi tiết
    return NextResponse.json({ 
      error: error.message,
      model: "gemini-3.1-flash-lite",
      suggestion: "Nếu lỗi 404, thử model: gemini-3-flash hoặc gemini-1.5-flash"
    }, { status: 500 });
  }
}
