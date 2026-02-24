import { inngest } from "./client";
import OpenAI from "openai";
import { logger } from "../utils/logger";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is missing");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =====================================================
   PROCESS CHAT MESSAGE
===================================================== */

export const processChatMessage = inngest.createFunction(
  { id: "process-chat-message" },
  { event: "therapy/session.message" },
  async ({ event, step }) => {
    try {
      const {
        message,
        history,
        memory = {
          userProfile: { emotionalState: [], riskLevel: 0, preferences: {} },
          sessionContext: { conversationThemes: [], currentTechnique: null },
        },
        goals = [],
        systemPrompt = "You are a professional therapist.",
      } = event.data;

      logger.info("Processing chat message", { message });

      /* -----------------------------
         ANALYSIS (OpenAI)
      ----------------------------- */

      const analysis = await step.run("analyze-message", async () => {
        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.3,
            messages: [
              { role: "system", content: "Return only valid JSON." },
              {
                role: "user",
                content: `
Analyze this therapy message.

Message: ${message}
Context: ${JSON.stringify({ memory, goals })}

Return JSON:
{
  "emotionalState": "string",
  "themes": ["string"],
  "riskLevel": number,
  "recommendedApproach": "string",
  "progressIndicators": ["string"]
}
`,
              },
            ],
          });

          const text =
            completion.choices[0]?.message?.content?.trim() || "";

          return JSON.parse(text.replace(/```json|```/g, "").trim());
        } catch (error) {
          logger.error("Analysis error:", error);
          return {
            emotionalState: "neutral",
            themes: [],
            riskLevel: 0,
            recommendedApproach: "supportive",
            progressIndicators: [],
          };
        }
      });

      /* -----------------------------
         UPDATE MEMORY
      ----------------------------- */

      const updatedMemory = await step.run("update-memory", async () => {
        if (analysis.emotionalState)
          memory.userProfile.emotionalState.push(analysis.emotionalState);

        if (analysis.themes)
          memory.sessionContext.conversationThemes.push(...analysis.themes);

        memory.userProfile.riskLevel = analysis.riskLevel || 0;

        return memory;
      });

      if (analysis.riskLevel > 4) {
        await step.run("trigger-risk-alert", async () => {
          logger.warn("High risk detected", {
            riskLevel: analysis.riskLevel,
          });
        });
      }

      /* -----------------------------
         GENERATE RESPONSE
      ----------------------------- */

      const response = await step.run("generate-response", async () => {
        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.7,
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: `
Message: ${message}
Analysis: ${JSON.stringify(analysis)}
Memory: ${JSON.stringify(memory)}
Goals: ${JSON.stringify(goals)}

Generate a professional therapeutic response.
`,
              },
            ],
          });

          return (
            completion.choices[0]?.message?.content?.trim() ||
            "I'm here to support you."
          );
        } catch (error) {
          logger.error("Response generation error:", error);
          return "I'm here to support you. Could you tell me more?";
        }
      });

      return { response, analysis, updatedMemory };
    } catch (error) {
      logger.error("Chat processing failed:", error);

      return {
        response:
          "I'm here to support you. Could you tell me more about what's on your mind?",
        analysis: {
          emotionalState: "neutral",
          themes: [],
          riskLevel: 0,
          recommendedApproach: "supportive",
          progressIndicators: [],
        },
        updatedMemory: event.data.memory,
      };
    }
  }
);

/* =====================================================
   ANALYZE THERAPY SESSION
===================================================== */

export const analyzeTherapySession = inngest.createFunction(
  { id: "analyze-therapy-session" },
  { event: "therapy/session.created" },
  async ({ event, step }) => {
    const sessionContent = event.data.notes || event.data.transcript;

    const analysis = await step.run("analyze-session", async () => {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Return JSON only." },
          {
            role: "user",
            content: `
Analyze this therapy session:

${sessionContent}

Return JSON with:
- keyThemes
- emotionalState
- areasOfConcern
- recommendations
- progressIndicators
`,
          },
        ],
      });

      const text =
        completion.choices[0]?.message?.content?.trim() || "{}";

      return JSON.parse(text.replace(/```json|```/g, "").trim());
    });

    return {
      message: "Session analysis completed",
      analysis,
    };
  }
);

/* =====================================================
   GENERATE ACTIVITY RECOMMENDATIONS
===================================================== */

export const generateActivityRecommendations =
  inngest.createFunction(
    { id: "generate-activity-recommendations" },
    { event: "mood/updated" },
    async ({ event, step }) => {
      const recommendations = await step.run(
        "generate-recommendations",
        async () => {
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "Return JSON only." },
              {
                role: "user",
                content: `
Generate 3-5 activity recommendations.

User Context:
${JSON.stringify(event.data)}

Return JSON with:
- activities
- reasoning
- expectedBenefits
- difficulty
- duration
`,
              },
            ],
          });

          const text =
            completion.choices[0]?.message?.content?.trim() || "{}";

          return JSON.parse(text.replace(/```json|```/g, "").trim());
        }
      );

      return {
        message: "Activity recommendations generated",
        recommendations,
      };
    }
  );

export const functions = [
  processChatMessage,
  analyzeTherapySession,
  generateActivityRecommendations,
];