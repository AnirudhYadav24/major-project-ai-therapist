import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { serve } from "inngest/express";
import { errorHandler } from "./middleware/errorHandler";
import { logger } from "./utils/logger";
import authRouter from "./routes/auth";
import chatRouter from "./routes/chat";
import moodRouter from "./routes/mood";
import activityRouter from "./routes/activity";
import { connectDB } from "./utils/db";
import { inngest } from "./inngest/client";
import { functions as inngestFunctions } from "./inngest/functions";

console.log("OPENAI_API_KEY exists?", Boolean(process.env.OPENAI_API_KEY));

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://YOUR-VERCEL-FRONTEND.vercel.app"
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json());
app.use(morgan("dev"));

// Routes (define ALL routes BEFORE listen)
app.get("/", (req, res) => {
  res.send("AI Therapist API running ✅");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Server is running" });
});

app.use("/api/inngest", serve({ client: inngest, functions: inngestFunctions }));

app.use("/auth", authRouter);
app.use("/chat", chatRouter);
app.use("/api/mood", moodRouter);
app.use("/api/activity", activityRouter);

// Error handler last
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    await connectDB();
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();