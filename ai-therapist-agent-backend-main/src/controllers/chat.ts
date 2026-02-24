import { Request, Response } from "express";
import { ChatSession } from "../models/ChatSession";
import OpenAI from "openai";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/logger";
import { inngest } from "../inngest/client";
import { User } from "../models/User";
import { InngestEvent } from "../types/inngest";
import { Types } from "mongoose";

/* =====================================================
   OPENAI INITIALIZATION
===================================================== */

if (!process.env.OPENAI_API_KEY) {
  throw new Error("❌ OPENAI_API_KEY is missing in environment variables");
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* =====================================================
   LIST CHAT SESSIONS  ✅ (FIXES GET /chat/sessions 404)
===================================================== */
export const listChatSessions = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return res.status(401).json({ message: "Unauthorized" });

    const userId = new Types.ObjectId(req.user.id);

    const sessions = await ChatSession.find({ userId })
      .sort({ updatedAt: -1 })
      .select("sessionId createdAt updatedAt startTime status");

    return res.json(sessions);
  } catch (error: any) {
    logger.error("List sessions error:", error);
    return res.status(500).json({ message: "Failed to load sessions" });
  }
};

/* =====================================================
   CREATE CHAT SESSION
===================================================== */
export const createChatSession = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return res.status(401).json({ message: "Unauthorized" });

    const userId = new Types.ObjectId(req.user.id);
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

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
    if (!req.user?.id) return res.status(401).json({ message: "Unauthorized" });

    const { sessionId } = req.params;
    const userId = new Types.ObjectId(req.user.id);

    const session = await ChatSession.findOne({ sessionId });
    if (!session) return res.status(404).json({ message: "Session not found" });

    if (session.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Forbidden" });
    }

    return res.json(session);
  } catch (error: any) {
    logger.error("Get session error:", error);
    return res.status(500).json({ message: "Failed to fetch chat session" });
  }
};

/* =====================================================
   SEND MESSAGE
===================================================== */
export const sendMessage = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return res.status(401).json({ message: "Unauthorized" });

    const { sessionId } = req.params;
    const { message } = req.body as { message?: string };

    if (!message || !message.trim()) {
      return res.status(400).json({ message: "Message is required" });
    }

    const userId = new Types.ObjectId(req.user.id);

    const session = await ChatSession.findOne({ sessionId });
    if (!session) return res.status(404).json({ message: "Session not found" });

    if (session.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Optional: log to Inngest (does not affect response)
    const event: InngestEvent = {
      name: "therapy/session.message",
      data: { message },
    };
    try {
      await inngest.send(event);
    } catch (e) {
      logger.warn("Inngest send failed (ignored):", e);
    }

    // Build a short conversation context from last N messages
    const lastMessages = (session.messages || []).slice(-12).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    /* -----------------------------
       1) ANALYSIS (JSON)
    ----------------------------- */
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

    const analysisResp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: "You output ONLY valid JSON." },
        ...lastMessages,
        { role: "user", content: analysisPrompt },
      ],
    });

    const analysisText = analysisResp.choices[0]?.message?.content?.trim() || "";
    let analysis: any = {
      emotionalState: "neutral",
      themes: [],
      riskLevel: 0,
      recommendedApproach: "supportive listening",
      progressIndicators: [],
    };

    try {
      const cleaned = analysisText.replace(/```json|```/g, "").trim();
      analysis = JSON.parse(cleaned);
    } catch {
      logger.warn("⚠️ Failed to parse analysis JSON:", analysisText);
    }

    /* -----------------------------
       2) RESPONSE
    ----------------------------- */
    const responsePrompt = `
You are an empathetic AI therapist.

Respond in a supportive, professional way.
Keep it clear and practical.
If the user seems at risk of self-harm, encourage reaching out to local emergency services or a trusted person.

User message: ${message}

Analysis: ${JSON.stringify(analysis)}
`;

    const responseResp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        { role: "system", content: "You are a professional, empathetic therapist." },
        ...lastMessages,
        { role: "user", content: responsePrompt },
      ],
    });

    const aiResponse =
      responseResp.choices[0]?.message?.content?.trim() ||
      "I’m here with you. Can you tell me a little more about what you’re feeling right now?";

    // Save user + assistant messages
    session.messages.push(
      { role: "user", content: message, timestamp: new Date() },
      {
        role: "assistant",
        content: aiResponse,
        timestamp: new Date(),
        metadata: {
          analysis,
          progress: {
            emotionalState: analysis.emotionalState,
            riskLevel: analysis.riskLevel,
          },
        },
      }
    );

    await session.save();

    return res.json({
      response: aiResponse,
      analysis,
      metadata: {
        progress: {
          emotionalState: analysis.emotionalState,
          riskLevel: analysis.riskLevel,
        },
      },
    });
  } catch (error: any) {
    logger.error("SEND MESSAGE ERROR:", error);
    return res.status(500).json({
      message: "Error processing message",
      error: error?.message || "Unknown server error",
    });
  }
};

/* =====================================================
   GET CHAT HISTORY
===================================================== */
export const getChatHistory = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) return res.status(401).json({ message: "Unauthorized" });

    const { sessionId } = req.params;
    const userId = new Types.ObjectId(req.user.id);

    const session = await ChatSession.findOne({ sessionId });
    if (!session) return res.status(404).json({ message: "Session not found" });

    if (session.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    return res.json(session.messages);
  } catch (error: any) {
    logger.error("History error:", error);
    return res.status(500).json({ message: "Error fetching chat history" });
  }
};