import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

// GET - Test API
export async function GET() {
  const hasKey = !!process.env.GEMINI_API_KEY;
  return NextResponse.json({ 
    status: 'OK',
    hasGeminiKey: hasKey,
    model: 'gemini-3.1-flash-lite-preview'
  });
}

// POST - Gọi AI
export async function POST(req: Request) {
  try {
    const { contextPrompt, language = 'vi' } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "No API Key" }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // ✅ Model name chính xác
    const model = genAI.getGenerativeModel({ 
      model: "gemini-3.1-flash-lite-preview" 
    });

    const prompt = language === 'en' 
      ? `You are a friendly tour guide in Vietnam. Reply in English, short (3-4 sentences), fun with emojis.\n\n${contextPrompt}`
      : `Bạn là hướng dẫn viên du lịch thân thiện. Trả lời ngắn gọn (3-4 câu), vui vẻ, có emoji.\n\n${contextPrompt}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return NextResponse.json({ reply: text });
  } catch (error: any) {
    console.error("Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
