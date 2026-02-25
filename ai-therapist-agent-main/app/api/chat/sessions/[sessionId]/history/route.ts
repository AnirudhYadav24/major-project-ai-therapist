import { NextRequest, NextResponse } from "next/server";

const BACKEND_API_URL =
  process.env.BACKEND_API_URL || "https://major-project-ai-therapist.onrender.com";

export async function GET(
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

    const response = await fetch(
      `${BACKEND_API_URL}/chat/sessions/${sessionId}/history`,
      {
        method: "GET",
        headers: { Authorization: authHeader },
      }
    );

    const raw = await response.text();
    const data = raw ? JSON.parse(raw) : {};

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.message || data?.error || "Failed to get chat history" },
        { status: response.status }
      );
    }

    return NextResponse.json(
      Array.isArray(data)
        ? data.map((m: any) => ({ role: m.role, content: m.content, timestamp: m.timestamp }))
        : data
    );
  } catch (e) {
    console.error("Error getting chat history:", e);
    return NextResponse.json({ error: "Failed to get chat history" }, { status: 500 });
  }
}