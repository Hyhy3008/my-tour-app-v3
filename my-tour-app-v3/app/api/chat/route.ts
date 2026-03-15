import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { message, contextPrompt } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API Key chưa cấu hình" }, { status: 500 });
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = contextPrompt || `Trả lời ngắn gọn: ${message}`;
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return NextResponse.json({ reply: text });
  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Lỗi kết nối AI" }, { status: 500 });
  }
}
