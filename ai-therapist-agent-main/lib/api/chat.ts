// ai-therapist-agent-main/lib/api/chat.ts

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string; // ✅ ISO string (NOT Date)
  metadata?: {
    technique?: string;
    goal?: string;
    progress?: any;
    analysis?: any;
  };
};

// ✅ Match what your UI pages are using (sessionId + messages exist)
export type ChatSession = {
  _id?: string; // backend might send _id
  sessionId: string; // ✅ UI expects this
  title?: string;
  messages: ChatMessage[]; // ✅ UI expects this
  lastMessage?: string;
  createdAt?: string; // ✅ keep string to avoid Date mismatch
  updatedAt?: string; // ✅ keep string
};

// ✅ Use env if present, otherwise fallback
const API_BASE =
  process.env.NEXT_PUBLIC_BACKEND_API_URL ||
  process.env.BACKEND_API_URL ||
  "https://major-project-ai-therapist.onrender.com";

// ---------------- Helpers ----------------

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
  const authValue =
    token && token.trim().length > 0
      ? token.startsWith("Bearer ")
        ? token
        : `Bearer ${token}`
      : "";

  return {
    "Content-Type": "application/json",
    ...(authValue ? { Authorization: authValue } : {}),
  };
};

const safeJson = async (res: Response) => {
  const raw = await res.text();
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return { error: raw };
  }
};

const toISO = (v: any): string => {
  const d = v ? new Date(v) : new Date();
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
};

const normalizeMessage = (m: any): ChatMessage => ({
  role: m?.role,
  content: m?.content,
  timestamp: m?.timestamp ? toISO(m.timestamp) : undefined,
  metadata: m?.metadata,
});

const normalizeSession = (s: any): ChatSession => {
  const id = s?._id || s?.id || s?.sessionId || "";
  const msgsRaw = Array.isArray(s?.messages) ? s.messages : [];
  const messages = msgsRaw.map(normalizeMessage);

  return {
    _id: s?._id,
    sessionId: id, // ✅ UI uses sessionId everywhere
    title: s?.title,
    messages, // ✅ UI uses session.messages
    lastMessage: s?.lastMessage || messages[messages.length - 1]?.content || "",
    createdAt: s?.createdAt ? toISO(s.createdAt) : undefined,
    updatedAt: s?.updatedAt ? toISO(s.updatedAt) : undefined,
  };
};

// ---------------- API ----------------

// ✅ Main sessions list
export const listChatSessions = async (): Promise<ChatSession[]> => {
  const res = await fetch(`${API_BASE}/chat/sessions`, {
    method: "GET",
    headers: getAuthHeaders(),
  });

  const data = await safeJson(res);

  if (!res.ok) {
    throw new Error(data?.message || data?.error || "Failed to fetch sessions");
  }

  const list = Array.isArray(data) ? data : data?.sessions || [];
  return list.map(normalizeSession).filter((x: ChatSession) => x.sessionId);
};

// ✅ create session
export const createChatSession = async (): Promise<any> => {
  const res = await fetch(`${API_BASE}/chat/sessions`, {
    method: "POST",
    headers: getAuthHeaders(),
  });

  const data = await safeJson(res);

  if (!res.ok) {
    throw new Error(data?.message || data?.error || "Failed to create session");
  }

  return data; // can be string OR object
};

// ✅ send message
export const sendMessage = async (sessionId: string, message: string) => {
  const res = await fetch(`${API_BASE}/chat/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ message }),
  });

  const data = await safeJson(res);

  if (!res.ok) {
    throw new Error(data?.message || data?.error || "Failed to send message");
  }

  return data;
};

// ✅ chat history
export const getChatHistory = async (
  sessionId: string
): Promise<ChatMessage[]> => {
  const res = await fetch(`${API_BASE}/chat/sessions/${sessionId}/history`, {
    method: "GET",
    headers: getAuthHeaders(),
  });

  const data = await safeJson(res);

  if (!res.ok) {
    throw new Error(data?.message || data?.error || "Failed to fetch history");
  }

  const list = Array.isArray(data) ? data : data?.history || [];
  return list.map(normalizeMessage);
};

// ✅ Backward-compatible aliases (KEEP ONLY THESE ONCE)
export const getAllChatSessions = listChatSessions;
export const sendChatMessage = sendMessage;