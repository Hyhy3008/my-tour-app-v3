// app/api/chat/route.ts

import { NextRequest, NextResponse } from "next/server";

let embeddingPipeline: any = null;

async function getEmbedding(text: string): Promise<number[] | null> {
  try {
    const { env } = await import("@xenova/transformers");
    env.cacheDir = "/tmp/xenova-cache";
    if (!embeddingPipeline) {
      const { pipeline } = await import("@xenova/transformers");
      embeddingPipeline = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    }
    const output = await embeddingPipeline(text, { pooling: "mean", normalize: true });
    return Array.from(output.data) as number[];
  } catch { return null; }
}

async function getSupabase() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function searchDocuments(queryEmbedding: number[], locationId: string | null, limit = 3): Promise<string[]> {
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc("search_documents", {
      query_embedding: queryEmbedding,
      current_location: locationId,
      match_count: limit,
    });
    if (error) return [];
    return (data || []).map((d: any) => String(d.content));
  } catch { return []; }
}

async function callCerebras(messages: { role: string; content: string }[], maxTokens = 400): Promise<string> {
  const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CEREBRAS_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama3.1-8b",
      messages,
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });
  if (!res.ok) throw new Error(`Cerebras error ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ============================================
// Summarize: tóm tắt 3 messages mới
// Nếu trùng với summary cũ → bỏ qua
// Nếu có thông tin mới → append
// ============================================
async function summarize(
  newMessages: { role: string; content: string }[],
  existingSummary: string,
  language: string
): Promise<string> {
  const lang = language === 'vi' ? 'tiếng Việt' : 'English';
  const convo = newMessages.map(m => `${m.role === 'user' ? 'Khách' : 'AI'}: ${m.content}`).join('\n');

  const prompt = existingSummary
    ? `Bạn là AI tóm tắt hội thoại du lịch.

TÓM TẮT CŨ:
${existingSummary}

HỘI THOẠI MỚI:
${convo}

NHIỆM VỤ: Phân tích hội thoại mới. 
- Nếu KHÔNG có thông tin mới so với tóm tắt cũ → trả về chính xác: "NO_UPDATE"
- Nếu CÓ thông tin mới → cập nhật tóm tắt, giữ thông tin quan trọng, bỏ chi tiết thừa.
Tóm tắt bằng ${lang}, tối đa 150 từ. CHỈ trả về tóm tắt, không giải thích.`
    : `Tóm tắt cuộc hội thoại du lịch này bằng ${lang}, tối đa 150 từ. 
Giữ lại: địa điểm, thông tin quan trọng, câu hỏi đã hỏi.
CHỈ trả về tóm tắt, không giải thích.

HỘI THOẠI:
${convo}`;

  const result = await callCerebras([
    { role: "system", content: "Bạn là AI tóm tắt ngắn gọn, chính xác." },
    { role: "user", content: prompt },
  ], 200);

  // Nếu AI nói không có gì mới → giữ summary cũ
  if (result.trim() === "NO_UPDATE" || result.includes("NO_UPDATE")) {
    return existingSummary;
  }

  return result.trim();
}

// ============================================
// Main handler
// ============================================
export async function POST(req: NextRequest) {
  try {
    const {
      contextPrompt,
      userQuestion,
      locationId,
      language = "vi",
      // Memory từ client
      conversationMemory,  // { summary: string, recentMessages: [], messageCount: number }
    } = await req.json();

    if (!process.env.CEREBRAS_API_KEY) {
      return NextResponse.json({ error: "CEREBRAS_API_KEY chưa cấu hình" }, { status: 500 });
    }

    const query = userQuestion || contextPrompt || "";
    if (!query) return NextResponse.json({ error: "Thiếu câu hỏi" }, { status: 400 });

    const isArrival = !!contextPrompt && !userQuestion;
    const memory = conversationMemory || { summary: "", recentMessages: [], messageCount: 0 };

    // ── Bước 1: RAG ──
    let ragContext = "";
    const embedding = await getEmbedding(query);
    if (embedding) {
      const docs = await searchDocuments(embedding, locationId || null);
      if (docs.length > 0) {
        ragContext = docs.map((d, i) => `[${i + 1}] ${d}`).join("\n\n");
        console.log(`✅ RAG: ${docs.length} docs`);
      }
    }

    // ── Bước 2: Kiểm tra có cần summarize không ──
    // Cứ mỗi 3 messages → tóm tắt lại
    let updatedSummary = memory.summary;
    let shouldSummarize = false;

    if (memory.recentMessages.length >= 6) { // 6 = 3 cặp user/assistant
      shouldSummarize = true;
      console.log("🔄 Summarizing conversation...");
      try {
        updatedSummary = await summarize(
          memory.recentMessages,
          memory.summary,
          language
        );
        console.log(`✅ Summary: "${updatedSummary.substring(0, 80)}..."`);
      } catch (e) {
        console.error("Summarize failed:", e);
        updatedSummary = memory.summary; // giữ cũ nếu fail
      }
    }

    // ── Bước 3: Build messages gửi Cerebras ──
    const systemContent = [
      language === "en"
        ? "You are a friendly, knowledgeable tour guide in Vietnam."
        : "Bạn là hướng dẫn viên du lịch thân thiện và am hiểu tại Việt Nam.",

      // Memory context
      updatedSummary
        ? (language === "en"
          ? `\nCONVERSATION CONTEXT (what tourist already asked):\n${updatedSummary}`
          : `\nNGỮ CẢNH HỘI THOẠI (khách đã hỏi gì):\n${updatedSummary}`)
        : "",

      // RAG context
      ragContext
        ? (language === "en"
          ? `\nREFERENCE DOCUMENTS:\n${ragContext}\nDo not invent info not in documents.`
          : `\nTÀI LIỆU THAM KHẢO:\n${ragContext}\nKhông bịa thêm thông tin.`)
        : "",

      language === "en"
        ? "Reply in English, 3-4 sentences, friendly with emojis."
        : "Trả lời tiếng Việt, 3-4 câu, thân thiện, có emoji.",

      isArrival
        ? (language === "en" ? "Tourist just ARRIVED - welcome and brief intro." : "Khách vừa ĐẾN - chào đón và giới thiệu ngắn.")
        : "",
    ].filter(Boolean).join("\n");

    // Lấy 2 messages gần nhất (sau khi đã summarize)
    const recentToSend = shouldSummarize
      ? [] // đã tóm tắt hết, bắt đầu fresh
      : memory.recentMessages.slice(-4); // 2 cặp gần nhất

    const messages = [
      { role: "system", content: systemContent },
      ...recentToSend,
      { role: "user", content: query },
    ];

    // ── Bước 4: Gọi Cerebras ──
    const reply = await callCerebras(messages);

    // ── Bước 5: Trả về reply + memory update ──
    return NextResponse.json({
      reply,
      memoryUpdate: {
        summary: updatedSummary,
        // Nếu vừa summarize → reset recentMessages, nếu không → append
        recentMessages: shouldSummarize
          ? [
              { role: "user", content: query },
              { role: "assistant", content: reply },
            ]
          : [
              ...memory.recentMessages,
              { role: "user", content: query },
              { role: "assistant", content: reply },
            ],
        messageCount: memory.messageCount + 1,
        didSummarize: shouldSummarize,
      },
    });

  } catch (error: any) {
    console.error("Chat API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
