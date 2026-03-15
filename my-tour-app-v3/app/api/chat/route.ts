// app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";

// ✅ KHÔNG khởi tạo supabase ở module level
// Tạo trong function để tránh lỗi build khi env chưa có

async function getSupabase() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

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
    // all-MiniLM-L6-v2 có thể trả về shape khác nhau
    if (Array.isArray(data) && Array.isArray(data[0])) return data[0];
    if (Array.isArray(data)) return data;
    return null;
  } catch {
    return null;
  }
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
    if (error) {
      console.error("Supabase search error:", error);
      return [];
    }
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

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Cerebras error ${res.status}: ${errText}`);
  }
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
    if (!query) {
      return NextResponse.json({ error: "Thiếu nội dung câu hỏi" }, { status: 400 });
    }

    const isArrival = !!contextPrompt && !userQuestion;

    // Bước 1: RAG - embed + tìm docs
    let ragContext = "";
    const embedding = await embedQuery(query);

    if (embedding && embedding.length > 0) {
      const docs = await searchDocuments(embedding, locationId || null);
      if (docs.length > 0) {
        ragContext = docs.map((d, i) => `[${i + 1}] ${d}`).join("\n\n");
        console.log(`RAG OK: ${docs.length} docs, location=${locationId}`);
      }
    } else {
      console.log("RAG skip: no embedding (HUGGINGFACE_API_KEY missing or error)");
    }

    // Bước 2: Build prompt
    const hasContext = ragContext.length > 0;

    const systemPrompt = language === "en"
      ? [
          "You are a friendly, knowledgeable tour guide in Vietnam.",
          hasContext
            ? `Use ONLY the reference documents below:\n\n${ragContext}\n\nDo not invent information.`
            : "Use your general knowledge to help.",
          "Reply in English, 3-4 sentences, friendly with emojis.",
          isArrival
            ? "The tourist just ARRIVED here - welcome them and give a brief intro."
            : "Answer the tourist's question directly.",
        ].join("\n")
      : [
          "Bạn là hướng dẫn viên du lịch thân thiện tại Việt Nam.",
          hasContext
            ? `Chỉ dùng TÀI LIỆU bên dưới để trả lời:\n\n${ragContext}\n\nKhông bịa thêm thông tin.`
            : "Dùng kiến thức chung để hỗ trợ du khách.",
          "Trả lời tiếng Việt, 3-4 câu, thân thiện, có emoji.",
          isArrival
            ? "Khách vừa ĐẾN địa điểm - chào đón và giới thiệu tổng quan."
            : "Trả lời trực tiếp câu hỏi của khách.",
        ].join("\n");

    // Bước 3: Gọi Cerebras
    const reply = await callCerebras(systemPrompt, query);

    return NextResponse.json({ reply });

  } catch (error: any) {
    console.error("Chat API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
