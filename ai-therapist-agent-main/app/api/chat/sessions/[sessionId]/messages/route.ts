import { NextRequest, NextResponse } from "next/server";

const BACKEND_API_URL =
  process.env.BACKEND_API_URL || "https://major-project-ai-therapist.onrender.com";

export async function POST(
  req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json(
        { error: "Authorization header is required" },
        { status: 401 }
      );
    }

    const { sessionId } = params;
    const { message } = await req.json();

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const response = await fetch(
      `${BACKEND_API_URL}/chat/sessions/${sessionId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({ message }),
      }
    );

    const raw = await response.text();
    const data = raw ? JSON.parse(raw) : {};

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.message || data?.error || "Failed to send message" },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (e) {
    console.error("Error sending message:", e);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}