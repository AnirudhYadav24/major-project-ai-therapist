import { NextRequest, NextResponse } from "next/server";

const BACKEND_API_URL =
  process.env.BACKEND_API_URL || "https://major-project-ai-therapist.onrender.com";

export async function POST(req: NextRequest) {
  try {
    // Accept both header casings (safe)
    const authHeader =
      req.headers.get("authorization") || req.headers.get("Authorization");

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
        Authorization: authHeader, // should be: Bearer <JWT>
      },
    });

    const raw = await response.text();
    let data: any;

    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { error: raw };
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            data?.message || data?.error || "Failed to create chat session",
        },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error creating chat session:", error);
    return NextResponse.json(
      { error: "Failed to create chat session" },
      { status: 500 }
    );
  }
}