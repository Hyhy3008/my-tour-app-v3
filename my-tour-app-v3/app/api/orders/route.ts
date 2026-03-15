import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    const order = {
      id: `ORD-${Date.now()}`,
      ...body,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    };

    // Log để debug
    console.log('📦 New Order:', JSON.stringify(order, null, 2));

    return NextResponse.json({ 
      success: true, 
      orderId: order.id 
    });
  } catch (error: any) {
    console.error("Order Error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
