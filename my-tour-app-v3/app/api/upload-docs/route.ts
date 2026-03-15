// app/api/upload-docs/route.ts
import { NextRequest, NextResponse } from "next/server";

let embeddingPipeline: any = null;

async function getEmbedding(text: string): Promise<number[] | null> {
  try {
    // ✅ Trỏ cache sang /tmp
    const { env } = await import("@xenova/transformers");
    env.cacheDir = "/tmp/xenova-cache";

    if (!embeddingPipeline) {
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
    console.error("Embed error:", e);
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

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();

    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await getSupabase();

    const { data: rows, error } = await supabase
      .from("documents")
      .select("id, content, location_id")
      .is("embedding", null)
      .order("created_at", { ascending: true });

    if (error) throw error;

    if (!rows || rows.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Tất cả docs đã có embedding!",
        total: 0,
      });
    }

    console.log(`Fill embedding cho ${rows.length} docs...`);

    let successCount = 0;
    let failCount = 0;
    const results = [];

    for (const row of rows) {
      try {
        const embedding = await getEmbedding(row.content);
        if (!embedding) {
          failCount++;
          results.push({ id: row.id, status: "fail" });
          continue;
        }

        const { error: updateError } = await supabase
          .from("documents")
          .update({ embedding })
          .eq("id", row.id);

        if (updateError) throw updateError;

        successCount++;
        results.push({
          id: row.id,
          location_id: row.location_id,
          status: "ok",
          dims: embedding.length,
        });
        console.log(`✅ ${row.location_id || "general"}`);
      } catch (e: any) {
        failCount++;
        results.push({ id: row.id, status: "error", reason: e.message });
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
