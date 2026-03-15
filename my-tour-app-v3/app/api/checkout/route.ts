import { NextResponse } from "next/server";
import Stripe from "stripe";

export async function POST(req: Request) {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return NextResponse.json({ error: "Stripe chưa cấu hình" }, { status: 500 });
    }
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const domain = process.env.NEXT_PUBLIC_DOMAIN || 'http://localhost:3000';
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: "Ninh Bình AI Tour Guide - 24h", description: "AI thuyết minh du lịch" },
          unit_amount: 600,
        },
        quantity: 1,
      }],
      mode: "payment",
      success_url: `${domain}/?status=success`,
      cancel_url: `${domain}/?status=cancel`,
    });
    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error("Checkout Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
