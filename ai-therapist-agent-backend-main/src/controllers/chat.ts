import { Request, Response } from "express";
import { ChatSession } from "../models/ChatSession";
import OpenAI from "openai";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/logger";
import { inngest } from "../inngest/client";
import { InngestEvent } from "../types/inngest";
import { Types } from "mongoose";

/* =====================================================
   OPENAI INITIALIZATION
===================================================== */
if (!process.env.OPENAI_API_KEY) {
  throw new Error("❌ OPENAI_API_KEY is missing in environment variables");
}

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =====================================================
   HELPERS
===================================================== */
const extractOpenAIError = (err: any) => {
  const status = err?.status || err?.response?.status;
  const message =
    err?.error?.message ||
    err?.response?.data?.error?.message ||
    err?.message ||
    "Unknown error";
  return { status, message };
};

const toISO = (v?: any) => {
  const d = v ? new Date(v) : new Date();
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
};

const safeRole = (r: any): "user" | "assistant" =>
  r === "assistant" ? "assistant" : "user";

/* =====================================================
   LIST ALL CHAT SESSIONS
===================================================== */
export const listChatSessions = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userId = new Types.ObjectId(req.user.id);

    const sessions = await ChatSession.find({ userId })
      .sort({ startTime: -1 })
      .select("sessionId startTime status messages");

    const formatted = sessions.map((s: any) => {
      const msgs = Array.isArray(s.messages) ? s.messages : [];
      const last = msgs.length ? msgs[msgs.length - 1]?.content : "";

      return {
        sessionId: s.sessionId,
        startTime: s.startTime ? toISO(s.startTime) : undefined,
        status: s.status,
        lastMessage: last || "",
        messagesCount: msgs.length,
      };
    });

    return res.json(formatted);
  } catch (error: any) {
    logger.error("List chat sessions error:", error);
    return res.status(500).json({
      message: "Failed to fetch chat sessions",
      error: error?.message || "Unknown error",
    });
  }
};

/* =====================================================
   CREATE CHAT SESSION
===================================================== */
export const createChatSession = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userId = new Types.ObjectId(req.user.id);

    const session = await ChatSession.create({
      sessionId: uuidv4(),
      userId,
      startTime: new Date(),
      status: "active",
      messages: [],
    });

    return res.status(201).json({
      message: "Chat session created successfully",
      sessionId: session.sessionId,
    });
  } catch (error: any) {
    logger.error("Create session error:", error);
    return res.status(500).json({
      message: "Error creating chat session",
      error: error?.message || "Unknown error",
    });
  }
};

/* =====================================================
   GET SINGLE CHAT SESSION
===================================================== */
export const getChatSession = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const { sessionId } = req.params;
    const userId = new Types.ObjectId(req.user.id);

    const session = await ChatSession.findOne({ sessionId, userId });

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    return res.json(session);
  } catch (error: any) {
    logger.error("Get session error:", error);
    return res.status(500).json({
      message: "Failed to fetch chat session",
      error: error?.message || "Unknown error",
    });
  }
};

/* =====================================================
   GET CHAT HISTORY
===================================================== */
export const getChatHistory = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const { sessionId } = req.params;
    const userId = new Types.ObjectId(req.user.id);

    const session = await ChatSession.findOne({ sessionId, userId });
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    const msgs = Array.isArray(session.messages) ? session.messages : [];

    const normalized = msgs.map((m: any) => ({
      role: safeRole(m.role),
      content: m.content,
      timestamp: m.timestamp ? toISO(m.timestamp) : undefined,
      metadata: m.metadata,
    }));

    return res.json(normalized);
  } catch (error: any) {
    logger.error("History error:", error);
    return res.status(500).json({
      message: "Error fetching chat history",
      error: error?.message || "Unknown error",
    });
  }
};

/* =====================================================
   SEND MESSAGE
===================================================== */
export const sendMessage = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const { sessionId } = req.params;
    const { message } = req.body as { message?: string };

    if (!message || !message.trim()) {
      return res.status(400).json({ message: "Message is required" });
    }

    const userId = new Types.ObjectId(req.user.id);
    const session = await ChatSession.findOne({ sessionId, userId });
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    const event: InngestEvent = {
      name: "therapy/session.message",
      data: { message },
    };

    try {
      await inngest.send(event);
    } catch (e) {
      logger.warn("Inngest send failed (ignored):", e);
    }

    const lastMessages = session.messages.slice(-12).map((m: any) => ({
      role: safeRole(m.role),
      content: m.content,
    }));

    const analysisPrompt = `
Return ONLY valid JSON.

User message: ${message}

JSON format:
{
  "emotionalState": "string",
  "themes": ["string"],
  "riskLevel": number,
  "recommendedApproach": "string",
  "progressIndicators": ["string"]
}
`;

    let analysis: any = {
      emotionalState: "neutral",
      themes: [],
      riskLevel: 0,
      recommendedApproach: "supportive listening",
      progressIndicators: [],
    };

    try {
      const analysisCompletion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        temperature: 0.2,
        messages: [
          { role: "system", content: "You output ONLY valid JSON." },
          ...lastMessages,
          { role: "user", content: analysisPrompt },
        ],
      });

      const txt =
        analysisCompletion.choices[0]?.message?.content?.trim() || "";
      const cleaned = txt.replace(/```json|```/g, "").trim();
      analysis = JSON.parse(cleaned);
    } catch (err: any) {
      const { status, message: msg } = extractOpenAIError(err);
      logger.warn("Analysis failed:", { status, msg });
    }

    const responsePrompt = `
You are an empathetic AI therapist.

Respond in a supportive, professional way.
If user seems at risk of self-harm, encourage reaching out to local emergency services or a trusted person.

User message: ${message}

Analysis: ${JSON.stringify(analysis)}
`;

    let aiResponse =
      "I’m here with you. Can you tell me more about what you’re feeling?";

    try {
      const responseCompletion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        temperature: 0.7,
        messages: [
          { role: "system", content: "You are a professional therapist." },
          ...lastMessages,
          { role: "user", content: responsePrompt },
        ],
      });

      aiResponse =
        responseCompletion.choices[0]?.message?.content?.trim() || aiResponse;
    } catch (err: any) {
      const { status, message: msg } = extractOpenAIError(err);
      logger.error("OpenAI response failed:", { status, msg });
      return res.status(500).json({
        message: "Error processing message",
        error: msg,
      });
    }

    const now = new Date();

    session.messages.push(
      { role: "user", content: message, timestamp: now },
      {
        role: "assistant",
        content: aiResponse,
        timestamp: now,
        metadata: {
          analysis,
          progress: {
            emotionalState: analysis?.emotionalState || "neutral",
            riskLevel: Number(analysis?.riskLevel || 0),
          },
        },
      }
    );

    await session.save();

    return res.json({
      response: aiResponse,
      analysis,
    });
  } catch (error: any) {
    logger.error("SEND MESSAGE ERROR:", error);
    return res.status(500).json({
      message: "Error processing message",
      error: error?.message || "Unknown server error",
    });
  }
};