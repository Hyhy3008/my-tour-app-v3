// app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";

let embeddingPipeline: any = null;

interface MemoryMessage {
  role: string; // "user" | "assistant"
  content: string;
}

interface ConversationMemory {
  summary: string;
  recentMessages: MemoryMessage[];
  messageCount: number;
  summaryLang?: "vi" | "en" | "ko" | "zh"; // ✅ NEW
}

function normalizeLanguage(input: any): "vi" | "en" | "ko" | "zh" {
  const v = String(input || "vi").toLowerCase().trim();
  if (v === "en") return "en";
  if (v === "ko") return "ko";
  if (v === "zh" || v === "zh-cn" || v === "cn") return "zh";
  return "vi";
}

function langName(lang: "vi" | "en" | "ko" | "zh") {
  switch (lang) {
    case "en":
      return "English";
    case "ko":
      return "Korean";
    case "zh":
      return "Chinese (Simplified)";
    default:
      return "Vietnamese";
  }
}

// Heuristic đoán ngôn ngữ summary cũ nếu chưa có summaryLang (backward compatible)
function guessLang(text: string): "vi" | "en" | "ko" | "zh" {
  const s = text || "";
  // Hangul
  if (/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(s)) return "ko";
  // CJK
  if (/[\u4E00-\u9FFF]/.test(s)) return "zh";
  // Mostly ASCII -> assume English
  const ascii = (s.match(/[A-Za-z]/g) || []).length;
  const nonAscii = (s.match(/[^\x00-\x7F]/g) || []).length;
  if (ascii > 20 && nonAscii < 5) return "en";
  return "vi";
}

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

  if (!res.ok) throw new Error(`Cerebras error ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

function systemGuidePrompt(lang: "vi" | "en" | "ko" | "zh") {
  // ✅ ép ngôn ngữ rất mạnh
  switch (lang) {
    case "en":
      return `You are a friendly, knowledgeable tour guide in Vietnam.
IMPORTANT: Reply ONLY in English. Even if context/documents are Vietnamese, translate and still reply in English.
Keep it short (3–4 sentences), friendly, with emojis.`;
    case "ko":
      return `당신은 베트남의 친절하고 지식이 풍부한 여행 가이드입니다.
중요: 반드시 한국어로만 답변하세요. 문서/맥락이 베트남어여도 한국어로 번역해 답변하세요.
3~4문장으로 짧게, 친근하게, 이모지 포함.`;
    case "zh":
      return `你是一位友好且知识丰富的越南导游。
重要：必须只用简体中文回答。即使上下文/资料是越南语，也要翻译后用中文回答。
回答保持简短：3-4 句话，语气友好，可带 emoji。`;
    default:
      return `Bạn là hướng dẫn viên du lịch thân thiện và am hiểu tại Việt Nam.
Quan trọng: BẮT BUỘC chỉ trả lời bằng tiếng Việt.
Trả lời ngắn (3–4 câu), thân thiện, có emoji.`;
  }
}

function contextLabel(lang: "vi" | "en" | "ko" | "zh") {
  switch (lang) {
    case "en":
      return "CONVERSATION CONTEXT (summary):";
    case "ko":
      return "대화 맥락 (요약):";
    case "zh":
      return "对话上下文（摘要）：";
    default:
      return "NGỮ CẢNH HỘI THOẠI (tóm tắt):";
  }
}

function docsLabel(lang: "vi" | "en" | "ko" | "zh") {
  switch (lang) {
    case "en":
      return "REFERENCE DOCUMENTS (may be Vietnamese; translate if needed):";
    case "ko":
      return "참고 자료 (베트남어일 수 있음, 필요 시 번역):";
    case "zh":
      return "参考资料（可能是越南语，如需要请翻译）：";
    default:
      return "TÀI LIỆU THAM KHẢO (có thể là tiếng Việt):";
  }
}

function arrivalInstruction(lang: "vi" | "en" | "ko" | "zh") {
  switch (lang) {
    case "en":
      return "Tourist just ARRIVED. Welcome them and give a brief intro.";
    case "ko":
      return "관광객이 방금 도착했습니다. 환영 인사와 짧은 소개를 하세요.";
    case "zh":
      return "游客刚到。请欢迎并做简短介绍。";
    default:
      return "Khách vừa đến. Chào đón và giới thiệu ngắn.";
  }
}

// ✅ NEW: translate/re-summary summary sang ngôn ngữ mới khi user đổi language
async function translateSummary(
  existingSummary: string,
  targetLang: "vi" | "en" | "ko" | "zh"
): Promise<string> {
  const target = langName(targetLang);

  const prompt = `Translate / rewrite the following conversation summary into ${target}.
Rules:
- Keep the same meaning and facts.
- Keep <= 150 words.
- Do NOT add new info.
- Output ONLY the translated summary text.

SUMMARY:
${existingSummary}`;

  const result = await callCerebras(
    [
      { role: "system", content: "You translate faithfully and concisely. Output only the translation." },
      { role: "user", content: prompt },
    ],
    220
  );

  return (result || "").trim();
}

// Summarize/merge: luôn output theo ngôn ngữ hiện tại
async function summarize(
  newMessages: MemoryMessage[],
  existingSummary: string,
  targetLang: "vi" | "en" | "ko" | "zh"
): Promise<string> {
  const convo = newMessages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  const target = langName(targetLang);

  const prompt = existingSummary
    ? `Update a compact tour conversation summary.

Existing summary:
${existingSummary}

New conversation:
${convo}

Task:
- If NO important new info, output exactly: NO_UPDATE
- Else output UPDATED summary in ${target}, <=150 words
- Keep: places, user interests/preferences, key questions
- Output ONLY summary text or NO_UPDATE`
    : `Create a compact tour conversation summary in ${target}, <=150 words.
Keep: places, user interests/preferences, key questions.
Output ONLY summary text.

Conversation:
${convo}`;

  const result = await callCerebras(
    [
      { role: "system", content: "You are a precise summarizer. Follow instructions strictly." },
      { role: "user", content: prompt },
    ],
    220
  );

  const cleaned = (result || "").trim();
  if (cleaned === "NO_UPDATE" || cleaned.includes("NO_UPDATE")) return existingSummary;
  return cleaned;
}

function normalizeMemory(memory: any): ConversationMemory {
  return {
    summary: typeof memory?.summary === "string" ? memory.summary : "",
    recentMessages: Array.isArray(memory?.recentMessages) ? memory.recentMessages : [],
    messageCount: typeof memory?.messageCount === "number" ? memory.messageCount : 0,
    summaryLang: memory?.summaryLang ? normalizeLanguage(memory.summaryLang) : undefined,
  };
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
      conversationMemory,
    } = await req.json();

    if (!process.env.CEREBRAS_API_KEY) {
      return NextResponse.json({ error: "CEREBRAS_API_KEY chưa cấu hình" }, { status: 500 });
    }

    const lang = normalizeLanguage(language);

    const query = userQuestion || contextPrompt || "";
    if (!query) return NextResponse.json({ error: "Thiếu câu hỏi" }, { status: 400 });

    const isArrival = !!contextPrompt && !userQuestion;
    const memory = normalizeMemory(conversationMemory);

    // ── Step 1: RAG ──
    let ragContext = "";
    const embedding = await getEmbedding(query);
    if (embedding) {
      const docs = await searchDocuments(embedding, locationId || null);
      if (docs.length > 0) {
        ragContext = docs.map((d, i) => `[${i + 1}] ${d}`).join("\n\n");
      }
    }

    // ── Step 2: ensure summary matches selected language ──
    let summaryForPrompt = memory.summary;
    let summaryLang = memory.summaryLang || (memory.summary ? guessLang(memory.summary) : lang);

    if (summaryForPrompt && summaryLang !== lang) {
      try {
        // ✅ re-summary/translate summary sang ngôn ngữ mới
        summaryForPrompt = await translateSummary(summaryForPrompt, lang);
        summaryLang = lang;
      } catch {
        // nếu dịch fail thì vẫn dùng summary cũ, nhưng prompt vẫn ép output ngôn ngữ mới
      }
    }

    // ── Step 3: Build prompt ──
    const systemParts: string[] = [];
    systemParts.push(systemGuidePrompt(lang));

    if (summaryForPrompt) {
      systemParts.push(`${contextLabel(lang)}\n${summaryForPrompt}`);
    }

    if (ragContext) {
      systemParts.push(`${docsLabel(lang)}\n${ragContext}\n(Do not invent info not in documents.)`);
    }

    if (isArrival) systemParts.push(arrivalInstruction(lang));

    const systemContent = systemParts.filter(Boolean).join("\n\n");

    const recentToSend = memory.recentMessages.slice(-4);

    const messages = [
      { role: "system", content: systemContent },
      ...recentToSend,
      { role: "user", content: query },
    ];

    // ── Step 4: Call LLM ──
    const reply = await callCerebras(messages);

    // ── Step 5: Update memory ──
    const newPair: MemoryMessage[] = [
      { role: "user", content: query },
      { role: "assistant", content: reply },
    ];

    let nextRecentMessages = [...memory.recentMessages, ...newPair];

    // important: nếu vừa translate summary, dùng summary mới làm base
    let updatedSummary = summaryForPrompt || "";
    let didSummarize = false;

    try {
      // First summary after first 3 turns (6 messages)
      if (!updatedSummary && nextRecentMessages.length >= 6) {
        updatedSummary = await summarize(nextRecentMessages, "", lang);
        nextRecentMessages = [];
        didSummarize = true;
      }
      // Incremental update each turn after summary exists
      else if (updatedSummary && nextRecentMessages.length >= 2) {
        updatedSummary = await summarize(nextRecentMessages, updatedSummary, lang);
        nextRecentMessages = [];
        didSummarize = true;
      }
    } catch {
      // keep updatedSummary as-is
      didSummarize = false;
    }

    return NextResponse.json({
      reply,
      memoryUpdate: {
        summary: updatedSummary,
        recentMessages: nextRecentMessages,
        messageCount: (memory.messageCount || 0) + 1,
        didSummarize,
        summaryLang: lang, // ✅ NEW
      },
    });
  } catch (error: any) {
    console.error("Chat API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
