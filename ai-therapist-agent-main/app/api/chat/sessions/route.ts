import { NextRequest, NextResponse } from "next/server";

const BACKEND_API_URL =
  process.env.BACKEND_API_URL ||
  "https://ai-therapist-agent-backend.onrender.com";

export async function POST(req: NextRequest) {
  try {
    console.log("Creating new chat session...");

    const authHeader = req.headers.get("authorization"); // ✅ lowercase

    if (!authHeader) {
      return NextResponse.json(
        { error: "Authorization header is required" },
        { status: 401 }
      );
    }

    const response = await fetch(`${BACKEND_API_URL}/chat/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader, // must be: Bearer <JWT>
      },
    });

    const raw = await response.text();

    // ✅ Safely parse JSON
    let data: any;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { error: raw };
    }

    if (!response.ok) {
      console.error("Failed to create chat session:", data);
      return NextResponse.json(
        { error: data?.message || data?.error || "Failed to create chat session" },
        { status: response.status }
      );
    }

    console.log("Chat session created:", data);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error creating chat session:", error);
    return NextResponse.json(
      { error: "Failed to create chat session" },
      { status: 500 }
    );
  }
}