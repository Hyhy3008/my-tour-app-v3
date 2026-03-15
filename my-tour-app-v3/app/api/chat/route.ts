// app/api/chat/route.ts
// Dùng Xenova/transformers để embed - chạy local, KHÔNG cần API key ngoài

import { NextRequest, NextResponse } from "next/server";

// ✅ Lazy load pipeline để tránh lỗi build
let embeddingPipeline: any = null;

async function getEmbedding(text: string): Promise<number[] | null> {
  try {
    if (!embeddingPipeline) {
      // Dynamic import - chỉ load khi cần
      const { pipeline } = await import("@xenova/transformers");
      embeddingPipeline = await pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2"
      );
    }
    const output = await embeddingPipeline(text, {
      pooling: "mean",
      normalize: true,
    });
    return Array.from(output.data) as number[];
  } catch (e) {
    console.error("Embedding error:", e);
    return null;
  }
}

async function getSupabase() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function searchDocuments(
  queryEmbedding: number[],
  locationId: string | null,
  limit = 4
): Promise<string[]> {
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc("search_documents", {
      query_embedding: queryEmbedding,
      current_location: locationId,
      match_count: limit,
    });
    if (error) { console.error("Supabase search error:", error); return []; }
    return (data || []).map((d: any) => String(d.content));
  } catch (e) {
    console.error("Search error:", e);
    return [];
  }
}

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
  if (!res.ok) throw new Error(`Cerebras error ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

export async function POST(req: NextRequest) {
  try {
    const {
      contextPrompt,
      userQuestion,
      locationId,
      language = "vi",
    } = await req.json();

    if (!process.env.CEREBRAS_API_KEY) {
      return NextResponse.json({ error: "CEREBRAS_API_KEY chưa cấu hình" }, { status: 500 });
    }

    const query = userQuestion || contextPrompt || "";
    if (!query) return NextResponse.json({ error: "Thiếu câu hỏi" }, { status: 400 });

    const isArrival = !!contextPrompt && !userQuestion;

    // Bước 1: Embed + tìm docs
    let ragContext = "";
    const embedding = await getEmbedding(query);

    if (embedding) {
      const docs = await searchDocuments(embedding, locationId || null);
      if (docs.length > 0) {
        ragContext = docs.map((d, i) => `[${i + 1}] ${d}`).join("\n\n");
        console.log(`✅ RAG OK: ${docs.length} docs, location=${locationId}`);
      }
    }

    // Bước 2: Build prompt
    const hasContext = ragContext.length > 0;
    const systemPrompt = language === "en"
      ? [
          "You are a friendly tour guide in Vietnam.",
          hasContext ? `Use ONLY these documents:\n\n${ragContext}\n\nDo not invent info.` : "Use your knowledge.",
          "Reply in English, 3-4 sentences, friendly with emojis.",
          isArrival ? "Tourist just ARRIVED - welcome and intro briefly." : "Answer the question directly.",
        ].join("\n")
      : [
          "Bạn là hướng dẫn viên du lịch thân thiện tại Việt Nam.",
          hasContext ? `Chỉ dùng TÀI LIỆU này:\n\n${ragContext}\n\nKhông bịa thêm.` : "Dùng kiến thức chung.",
          "Trả lời tiếng Việt, 3-4 câu, thân thiện, có emoji.",
          isArrival ? "Khách vừa ĐẾN - chào đón và giới thiệu ngắn." : "Trả lời trực tiếp câu hỏi.",
        ].join("\n");

    // Bước 3: Gọi Cerebras
    const reply = await callCerebras(systemPrompt, query);
    return NextResponse.json({ reply });

  } catch (error: any) {
    console.error("Chat API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
