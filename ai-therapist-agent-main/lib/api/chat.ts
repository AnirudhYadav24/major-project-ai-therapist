// ai-therapist-agent-main/lib/api/chat.ts

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
};

export type ChatSession = {
  _id: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
};

// ✅ Use env if present, otherwise fallback to correct Render backend
const API_BASE =
  process.env.NEXT_PUBLIC_BACKEND_API_URL ||
  process.env.BACKEND_API_URL ||
  "https://major-project-ai-therapist.onrender.com";

// --- Helpers ---
const getToken = (): string | null => {
  if (typeof window === "undefined") return null;
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("jwt") ||
    null
  );
};

const getAuthHeaders = (): Record<string, string> => {
  const token = getToken();

  // If token already includes "Bearer ", keep it; else add Bearer prefix
  const authValue = token
    ? token.startsWith("Bearer ") ? token : `Bearer ${token}`
    : "";

  return {
    "Content-Type": "application/json",
    ...(authValue ? { Authorization: authValue } : {}),
  };
};

// --- API Calls ---

export const listChatSessions = async (): Promise<ChatSession[]> => {
  console.log("Fetching all chat sessions...");
  const response = await fetch(`${API_BASE}/chat/sessions`, {
    method: "GET",
    headers: getAuthHeaders(),
  });

  const raw = await response.text();
  let data: any;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { error: raw };
  }

  if (!response.ok) {
    console.error("Failed to fetch chat sessions:", data);
    throw new Error(data?.error || data?.message || "Failed to fetch chat sessions");
  }

  return data;
};

export const createChatSession = async (): Promise<ChatSession> => {
  console.log("Creating new chat session...");
  const response = await fetch(`${API_BASE}/chat/sessions`, {
    method: "POST",
    headers: getAuthHeaders(),
  });

  const raw = await response.text();
  let data: any;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { error: raw };
  }

  if (!response.ok) {
    console.error("Failed to create chat session:", data);
    throw new Error(data?.error || data?.message || "Failed to create chat session");
  }

  console.log("Chat session created:", data);
  return data;
};

export const sendMessage = async (
  sessionId: string,
  message: string
): Promise<any> => {
  try {
    console.log(`Sending message to session ${sessionId}:`, message);

    const response = await fetch(`${API_BASE}/chat/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ message }),
    });

    const raw = await response.text();
    let data: any;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { error: raw };
    }

    if (!response.ok) {
      console.error("Failed to send message:", data);
      throw new Error(data?.error || data?.message || "Failed to send message");
    }

    console.log("Message sent successfully:", data);
    return data;
  } catch (error) {
    console.error("Error sending chat message:", error);
    throw error;
  }
};

export const getChatHistory = async (
  sessionId: string
): Promise<ChatMessage[]> => {
  console.log(`Fetching chat history for session ${sessionId}`);

  const response = await fetch(`${API_BASE}/chat/sessions/${sessionId}/history`, {
    method: "GET",
    headers: getAuthHeaders(),
  });

  const raw = await response.text();
  let data: any;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { error: raw };
  }

  if (!response.ok) {
    console.error("Failed to fetch chat history:", data);
    throw new Error(data?.error || data?.message || "Failed to fetch chat history");
  }

  return Array.isArray(data) ? data : [];
};
