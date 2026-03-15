// app/api/upload-docs/route.ts
// Gọi 1 lần để fill embedding cho tất cả rows có embedding = NULL
// POST /api/upload-docs  body: { "password": "your_admin_password" }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Tạo embedding dùng HuggingFace (miễn phí)
// Model: all-MiniLM-L6-v2 → 384 chiều
async function createEmbedding(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(
      "https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: text }),
      }
    );

    if (!res.ok) {
      console.error("HF error:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    // all-MiniLM-L6-v2 trả về array 1 chiều hoặc nested
    return Array.isArray(data[0]) ? data[0] : data;
  } catch (e) {
    console.error("Embed error:", e);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();

    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.HUGGINGFACE_API_KEY) {
      return NextResponse.json({ error: "HUGGINGFACE_API_KEY chưa cấu hình" }, { status: 500 });
    }

    // Lấy tất cả rows chưa có embedding
    const { data: rows, error } = await supabase
      .from("documents")
      .select("id, content, location_id")
      .is("embedding", null)
      .order("created_at", { ascending: true });

    if (error) throw error;

    if (!rows || rows.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Tất cả docs đã có embedding rồi!",
        total: 0,
      });
    }

    console.log(`Cần fill embedding cho ${rows.length} docs...`);

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (const row of rows) {
      try {
        // Tạo embedding
        const embedding = await createEmbedding(row.content);

        if (!embedding) {
          failCount++;
          results.push({ id: row.id, location_id: row.location_id, status: "fail", reason: "embed returned null" });
          continue;
        }

        // Update embedding vào DB
        const { error: updateError } = await supabase
          .from("documents")
          .update({ embedding })
          .eq("id", row.id);

        if (updateError) throw updateError;

        successCount++;
        results.push({ id: row.id, location_id: row.location_id, status: "ok", dims: embedding.length });
        console.log(`✅ ${row.location_id || "general"} — ${row.content.substring(0, 50)}...`);

        // Delay 600ms để tránh rate limit HuggingFace free tier
        await new Promise(r => setTimeout(r, 600));

      } catch (e: any) {
        failCount++;
        results.push({ id: row.id, location_id: row.location_id, status: "error", reason: e.message });
        console.error(`❌ ${row.id}:`, e.message);
      }
    }

    return NextResponse.json({
      success: true,
      total: rows.length,
      success_count: successCount,
      fail_count: failCount,
      results,
    });

  } catch (error: any) {
    console.error("Upload docs error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
