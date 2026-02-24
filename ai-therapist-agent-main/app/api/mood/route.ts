iimport { NextRequest, NextResponse } from "next/server";

const BACKEND_API_URL =
  process.env.BACKEND_API_URL ||
  "https://ai-therapist-agent-backend.onrender.com";

  const token = req.headers.get("authorization"); // ✅ safer

  if (!token) {
    return NextResponse.json({ message: "No token provided" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { score, note } = body;

    if (typeof score !== "number" || score < 0 || score > 100) {
      return NextResponse.json({ error: "Invalid mood score" }, { status: 400 });
    }

    const response = await fetch(`${API_URL}/api/mood`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: token, // token should be: "Bearer <jwt>"
      },
      body: JSON.stringify({ score, note }),
    });

    const raw = await response.text();

    // ✅ try JSON, but don't crash if it's HTML
    let data: any;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { error: raw };
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.message || data?.error || "Failed to track mood" },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error tracking mood:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}