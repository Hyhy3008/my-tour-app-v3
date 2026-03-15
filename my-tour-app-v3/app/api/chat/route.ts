// app/api/chat/route.ts
// RAG Pipeline:
// 1. Embed câu hỏi → vector
// 2. Tìm trong Supabase (ưu tiên location hiện tại)
// 3. Ghép context → gửi Cerebras llama3.1-8b

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================
// Tạo embedding cho query dùng HuggingFace (miễn phí)
// Model: all-MiniLM-L6-v2 → 384 chiều
// ============================================
async function embedQuery(text: string): Promise<number[] | null> {
  try {
    const hfKey = process.env.HUGGINGFACE_API_KEY;
    if (!hfKey) return null;

    const res = await fetch(
      "https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hfKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: text }),
      }
    );

    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data[0]) ? data[0] : data;
  } catch {
    return null;
  }
}

// ============================================
// Tìm tài liệu liên quan từ Supabase pgvector
// Ưu tiên: docs của location hiện tại trước
// ============================================
async function searchDocuments(
  queryEmbedding: number[],
  locationId: string | null,
  limit = 4
): Promise<string[]> {
  try {
    const { data, error } = await supabase.rpc("search_documents", {
      query_embedding: queryEmbedding,
      current_location: locationId,
      match_count: limit,
    });

    if (error) {
      console.error("Supabase search error:", error);
      return [];
    }

    return (data || []).map((d: any) => d.content as string);
  } catch (e) {
    console.error("Search error:", e);
    return [];
  }
}

// ============================================
// Gọi Cerebras llama3.1-8b
// ============================================
async function callCerebras(systemPrompt: string, userMessage: string): Promise<string> {
  const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CEREBRAS_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama3.1-8b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: 400,
      temperature: 0.7,
    }),
  });

  if (!res.ok) throw new Error(`Cerebras error: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ============================================
// Main handler
// ============================================
export async function POST(req: NextRequest) {
  try {
    const {
      contextPrompt,  // prompt tự động khi đến địa điểm
      userQuestion,   // câu hỏi từ VoiceChat
      locationId,     // 'trang-an' | 'hang-mua' | null
      language = "vi",
    } = await req.json();

    if (!process.env.CEREBRAS_API_KEY) {
      return NextResponse.json({ error: "Cerebras API Key chưa cấu hình" }, { status: 500 });
    }

    const query = userQuestion || contextPrompt || "";
    const isArrival = !!contextPrompt && !userQuestion;

    // ── Bước 1: Embed query → tìm tài liệu liên quan ──
    let ragContext = "";
    const embedding = await embedQuery(query);

    if (embedding) {
      const docs = await searchDocuments(embedding, locationId || null);
      if (docs.length > 0) {
        ragContext = docs.map((d, i) => `[${i + 1}] ${d}`).join("\n\n");
        console.log(`✅ RAG: ${docs.length} docs, location=${locationId}`);
      }
    }

    // ── Bước 2: Build system prompt ──
    const hasContext = ragContext.length > 0;

    const systemPrompt = language === "en"
      ? `You are a friendly, knowledgeable tour guide in Vietnam for international tourists.
${hasContext ? `Use ONLY the reference documents below to answer accurately:\n\n${ragContext}\n\nDo not make up information not in the documents.` : "Use your knowledge to help the tourist."}
Reply in English, 3-4 sentences max, friendly with emojis.
${isArrival ? "Tourist just ARRIVED at this location - give a warm welcome and brief intro." : "Answer the tourist's question directly and helpfully."}`
      : `Bạn là hướng dẫn viên du lịch thân thiện và am hiểu tại Việt Nam.
${hasContext ? `Chỉ dùng TÀI LIỆU bên dưới để trả lời chính xác:\n\n${ragContext}\n\nKhông bịa thông tin không có trong tài liệu.` : "Dùng kiến thức của bạn để hỗ trợ du khách."}
Trả lời tiếng Việt, tối đa 3-4 câu, thân thiện, có emoji.
${isArrival ? "Khách vừa ĐẾN địa điểm - chào đón và giới thiệu tổng quan ngắn gọn." : "Trả lời trực tiếp câu hỏi của khách."}`;

    // ── Bước 3: Gọi Cerebras ──
    const reply = await callCerebras(systemPrompt, query);

    return NextResponse.json({ reply });

  } catch (error: any) {
    console.error("Chat API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
