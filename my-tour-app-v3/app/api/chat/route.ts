// app/api/chat/route.ts

import { NextRequest, NextResponse } from "next/server";

let embeddingPipeline: any = null;

interface MemoryMessage {
  role: string;
  content: string;
}

interface ConversationMemory {
  summary: string;
  recentMessages: MemoryMessage[];
  messageCount: number;
}

async function getEmbedding(text: string): Promise<number[] | null> {
  try {
    const { env } = await import("@xenova/transformers");
    env.cacheDir = "/tmp/xenova-cache";

    if (!embeddingPipeline) {
      const { pipeline } = await import("@xenova/transformers");
      embeddingPipeline = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    }

    const output = await embeddingPipeline(text, {
      pooling: "mean",
      normalize: true,
    });

    return Array.from(output.data) as number[];
  } catch {
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
  limit = 3
): Promise<string[]> {
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc("search_documents", {
      query_embedding: queryEmbedding,
      current_location: locationId,
      match_count: limit,
    });

    if (error) return [];
    return (data || []).map((d: any) => String(d.content));
  } catch {
    return [];
  }
}

async function callCerebras(
  messages: { role: string; content: string }[],
  maxTokens = 400
): Promise<string> {
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

  if (!res.ok) {
    throw new Error(`Cerebras error ${res.status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

function getLanguageLabel(language: string) {
  switch (language) {
    case 'en':
      return 'English';
    case 'ko':
      return '한국어';
    case 'zh':
      return '中文';
    case 'vi':
    default:
      return 'tiếng Việt';
  }
}

function getRoleNames(language: string) {
  switch (language) {
    case 'en':
      return { user: 'Tourist', ai: 'Guide' };
    case 'ko':
      return { user: '관광객', ai: '가이드' };
    case 'zh':
      return { user: '游客', ai: '导游' };
    case 'vi':
    default:
      return { user: 'Khách', ai: 'AI' };
  }
}

function getSystemGuidePrompt(language: string) {
  switch (language) {
    case 'en':
      return 'You are a friendly, knowledgeable tour guide in Vietnam.';
    case 'ko':
      return '당신은 베트남의 친절하고 박식한 여행 가이드입니다.';
    case 'zh':
      return '你是一位友好且知识丰富的越南导游。';
    case 'vi':
    default:
      return 'Bạn là hướng dẫn viên du lịch thân thiện và am hiểu tại Việt Nam.';
  }
}

function getContextLabel(language: string) {
  switch (language) {
    case 'en':
      return 'CONVERSATION CONTEXT (what tourist already asked):';
    case 'ko':
      return '대화 맥락 (관광객이 이전에 물어본 내용):';
    case 'zh':
      return '对话上下文（游客之前问过的内容）：';
    case 'vi':
    default:
      return 'NGỮ CẢNH HỘI THOẠI (khách đã hỏi gì):';
  }
}

function getReferenceLabel(language: string) {
  switch (language) {
    case 'en':
      return 'REFERENCE DOCUMENTS';
    case 'ko':
      return '참고 자료';
    case 'zh':
      return '参考资料';
    case 'vi':
    default:
      return 'TÀI LIỆU THAM KHẢO';
  }
}

function getNoHallucinationInstruction(language: string) {
  switch (language) {
    case 'en':
      return 'Do not invent info not in documents.';
    case 'ko':
      return '문서에 없는 내용은 지어내지 마세요.';
    case 'zh':
      return '不要编造资料中没有的信息。';
    case 'vi':
    default:
      return 'Không bịa thêm thông tin.';
  }
}

function getReplyInstruction(language: string) {
  switch (language) {
    case 'en':
      return 'Reply in English, 3-4 sentences, friendly with emojis.';
    case 'ko':
      return '한국어로 3~4문장, 친절하고 자연스럽게, 이모지도 포함해서 답변하세요.';
    case 'zh':
      return '请用中文回答，3到4句话，语气友好，并带一点 emoji。';
    case 'vi':
    default:
      return 'Trả lời tiếng Việt, 3-4 câu, thân thiện, có emoji.';
  }
}

function getArrivalInstruction(language: string) {
  switch (language) {
    case 'en':
      return 'Tourist just ARRIVED - welcome and brief intro.';
    case 'ko':
      return '관광객이 방금 도착했습니다. 짧게 환영하고 소개하세요.';
    case 'zh':
      return '游客刚刚到达，请简短欢迎并介绍一下。';
    case 'vi':
    default:
      return 'Khách vừa ĐẾN - chào đón và giới thiệu ngắn.';
  }
}

async function summarize(
  newMessages: MemoryMessage[],
  existingSummary: string,
  language: string
): Promise<string> {
  const lang = getLanguageLabel(language);
  const roleNames = getRoleNames(language);

  const convo = newMessages
    .map((m) => `${m.role === "user" ? roleNames.user : roleNames.ai}: ${m.content}`)
    .join("\n");

  const prompt = existingSummary
    ? `Bạn là AI tóm tắt hội thoại du lịch.

TÓM TẮT CŨ:
${existingSummary}

HỘI THOẠI MỚI:
${convo}

NHIỆM VỤ:
- So sánh hội thoại mới với tóm tắt cũ.
- Nếu KHÔNG có thông tin mới quan trọng → trả về chính xác: NO_UPDATE
- Nếu CÓ thông tin mới → cập nhật tóm tắt cũ thành bản đầy đủ hơn.
- Giữ lại: địa điểm đã hỏi, sở thích, câu hỏi nổi bật, mong muốn của khách.
- Bỏ chi tiết lặp lại, giữ ngắn gọn.
Tóm tắt bằng ${lang}, tối đa 150 từ.
CHỈ trả về kết quả cuối cùng, không giải thích.`
    : `Tóm tắt cuộc hội thoại du lịch này bằng ${lang}, tối đa 150 từ.
Giữ lại:
- địa điểm khách đã hỏi hoặc đã đến
- sở thích/điều khách quan tâm
- câu hỏi quan trọng
- bối cảnh hữu ích cho các lượt sau

CHỈ trả về tóm tắt, không giải thích.

HỘI THOẠI:
${convo}`;

  const result = await callCerebras(
    [
      { role: "system", content: "Bạn là AI tóm tắt ngắn gọn, chính xác." },
      { role: "user", content: prompt },
    ],
    200
  );

  if (result.trim() === "NO_UPDATE" || result.includes("NO_UPDATE")) {
    return existingSummary;
  }

  return result.trim();
}

function normalizeMemory(memory: any): ConversationMemory {
  return {
    summary: typeof memory?.summary === "string" ? memory.summary : "",
    recentMessages: Array.isArray(memory?.recentMessages) ? memory.recentMessages : [],
    messageCount: typeof memory?.messageCount === "number" ? memory.messageCount : 0,
  };
}

export async function POST(req: NextRequest) {
  try {
    const {
      contextPrompt,
      userQuestion,
      locationId,
      language = "vi",
      conversationMemory,
    } = await req.json();

    if (!process.env.CEREBRAS_API_KEY) {
      return NextResponse.json(
        { error: "CEREBRAS_API_KEY chưa cấu hình" },
        { status: 500 }
      );
    }

    const query = userQuestion || contextPrompt || "";
    if (!query) {
      return NextResponse.json({ error: "Thiếu câu hỏi" }, { status: 400 });
    }

    const isArrival = !!contextPrompt && !userQuestion;
    const memory = normalizeMemory(conversationMemory);

    let ragContext = "";
    const embedding = await getEmbedding(query);

    if (embedding) {
      const docs = await searchDocuments(embedding, locationId || null);
      if (docs.length > 0) {
        ragContext = docs.map((d, i) => `[${i + 1}] ${d}`).join("\n\n");
        console.log(`✅ RAG: ${docs.length} docs`);
      }
    }

    const systemContent = [
      getSystemGuidePrompt(language),

      memory.summary
        ? `\n${getContextLabel(language)}\n${memory.summary}`
        : "",

      ragContext
        ? `\n${getReferenceLabel(language)}:\n${ragContext}\n${getNoHallucinationInstruction(language)}`
        : "",

      getReplyInstruction(language),

      isArrival ? getArrivalInstruction(language) : "",
    ]
      .filter(Boolean)
      .join("\n");

    const recentToSend = memory.recentMessages.slice(-4);

    const messages = [
      { role: "system", content: systemContent },
      ...recentToSend,
      { role: "user", content: query },
    ];

    const reply = await callCerebras(messages);

    const newPair: MemoryMessage[] = [
      { role: "user", content: query },
      { role: "assistant", content: reply },
    ];

    let nextRecentMessages = [...memory.recentMessages, ...newPair];
    let updatedSummary = memory.summary;
    let didSummarize = false;

    try {
      if (!memory.summary && nextRecentMessages.length >= 6) {
        console.log("🔄 Creating first summary from first 3 turns...");
        updatedSummary = await summarize(nextRecentMessages, "", language);
        nextRecentMessages = [];
        didSummarize = true;
        console.log(`✅ First summary created: "${updatedSummary.substring(0, 80)}..."`);
      } else if (memory.summary && nextRecentMessages.length >= 2) {
        console.log("🔄 Incrementally updating summary...");
        updatedSummary = await summarize(nextRecentMessages, memory.summary, language);
        nextRecentMessages = [];
        didSummarize = true;
        console.log(`✅ Summary updated: "${updatedSummary.substring(0, 80)}..."`);
      }
    } catch (e) {
      console.error("Summarize failed:", e);
      updatedSummary = memory.summary;
      didSummarize = false;
    }

    return NextResponse.json({
      reply,
      memoryUpdate: {
        summary: updatedSummary,
        recentMessages: nextRecentMessages,
        messageCount: memory.messageCount + 1,
        didSummarize,
      },
    });
  } catch (error: any) {
    console.error("Chat API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
