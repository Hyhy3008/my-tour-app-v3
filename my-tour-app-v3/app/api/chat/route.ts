import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

// ============================================
// GET - Test API
// ============================================
export async function GET() {
  const hasKey = !!process.env.GEMINI_API_KEY;
  
  return NextResponse.json({ 
    status: 'API is running',
    hasGeminiKey: hasKey,
    model: 'gemini-pro',
    message: hasKey ? '✅ API Key configured' : '❌ Missing GEMINI_API_KEY',
    timestamp: new Date().toISOString()
  });
}

// ============================================
// POST - Gọi AI
// ============================================
export async function POST(req: Request) {
  try {
    const { contextPrompt, language = 'vi' } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    console.log('=== API Chat Called ===');

    if (!apiKey) {
      return NextResponse.json({ 
        error: "API Key chưa cấu hình" 
      }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // ✅ FIX: Dùng model "gemini-pro" (ổn định nhất)
    const model = genAI.getGenerativeModel({ 
      model: "gemini-pro" 
    });

    const prompt = language === 'en' 
      ? `You are a friendly tour guide in Vietnam for international tourists. Reply in English, short (3-4 sentences), fun and informative with emojis.

${contextPrompt}`
      : `Bạn là hướng dẫn viên du lịch thân thiện. Trả lời ngắn gọn (3-4 câu), vui vẻ, có emoji.

${contextPrompt}`;

    console.log('Calling Gemini Pro...');
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    console.log('✅ Success');

    return NextResponse.json({ reply: text });
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    return NextResponse.json({ 
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
