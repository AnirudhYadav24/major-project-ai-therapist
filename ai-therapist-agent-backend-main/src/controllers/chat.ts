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

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =====================================================
   CREATE CHAT SESSION
===================================================== */

export const createChatSession = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = new Types.ObjectId(req.user.id);
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

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
    logger.error("Error creating chat session:", error);
    return res.status(500).json({
      message: "Error creating chat session",
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
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { sessionId } = req.params;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ message: "Message is required" });
    }

    const userId = new Types.ObjectId(req.user.id);

    const session = await ChatSession.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    if (session.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    /* -----------------------------
       Inngest Event
    ----------------------------- */

    const event: InngestEvent = {
      name: "therapy/session.message",
      data: { message },
    };

    await inngest.send(event);

    /* -----------------------------
       1️⃣ ANALYSIS (OpenAI)
    ----------------------------- */

    const analysisPrompt = `
Analyze this therapy message and return ONLY valid JSON.

Message: ${message}

Required JSON structure:
{
  "emotionalState": "string",
  "themes": ["string"],
  "riskLevel": number,
  "recommendedApproach": "string",
  "progressIndicators": ["string"]
}
`;

    const analysisCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You return only valid JSON." },
        { role: "user", content: analysisPrompt },
      ],
      temperature: 0.3,
    });

    const analysisText =
      analysisCompletion.choices[0]?.message?.content?.trim() || "";

    let analysis: any;

    try {
      const cleaned = analysisText.replace(/```json|```/g, "").trim();
      analysis = JSON.parse(cleaned);
    } catch (err) {
      logger.warn("⚠️ Failed to parse analysis JSON:", analysisText);

      analysis = {
        emotionalState: "neutral",
        themes: [],
        riskLevel: 0,
        recommendedApproach: "supportive listening",
        progressIndicators: [],
      };
    }

    /* -----------------------------
       2️⃣ RESPONSE GENERATION
    ----------------------------- */

    const responsePrompt = `
You are an empathetic AI therapist.

User message:
${message}

Analysis:
${JSON.stringify(analysis)}

Provide a supportive, professional response.
`;

    const responseCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a professional therapist." },
        { role: "user", content: responsePrompt },
      ],
      temperature: 0.7,
    });

    const response =
      responseCompletion.choices[0]?.message?.content?.trim() ||
      "I'm here to support you.";

    /* -----------------------------
       SAVE MESSAGES
    ----------------------------- */

    session.messages.push(
      {
        role: "user",
        content: message,
        timestamp: new Date(),
      },
      {
        role: "assistant",
        content: response,
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

    /* -----------------------------
       RETURN RESPONSE
    ----------------------------- */

    return res.json({
      response,
      analysis,
      metadata: {
        progress: {
          emotionalState: analysis.emotionalState,
          riskLevel: analysis.riskLevel,
        },
      },
    });

  } catch (error: any) {
    logger.error("🔥 Error in sendMessage:", error);

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
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { sessionId } = req.params;
    const userId = new Types.ObjectId(req.user.id);

    const session = await ChatSession.findOne({ sessionId });

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    if (session.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    return res.json(session.messages);
  } catch (error: any) {
    logger.error("Error fetching chat history:", error);
    return res.status(500).json({ message: "Error fetching chat history" });
  }
};

/* =====================================================
   GET CHAT SESSION
===================================================== */

export const getChatSession = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const chatSession = await ChatSession.findOne({ sessionId });

    if (!chatSession) {
      return res.status(404).json({ error: "Chat session not found" });
    }

    return res.json(chatSession);
  } catch (error: any) {
    logger.error("Failed to get chat session:", error);
    return res.status(500).json({ error: "Failed to get chat session" });
  }
};