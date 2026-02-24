import express from "express";
import {
  createChatSession,
  getChatSession,
  sendMessage,
  getChatHistory,
  listChatSessions,
} from "../controllers/chat";
import { auth } from "../middleware/auth";

const router = express.Router();

// Apply authentication middleware to all chat routes
router.use(auth);

// ✅ List all sessions + create new session
router.route("/sessions").get(listChatSessions).post(createChatSession);

// Get single session
router.route("/sessions/:sessionId").get(getChatSession);

// Send message to session
router.route("/sessions/:sessionId/messages").post(sendMessage);

// Get chat history
router.route("/sessions/:sessionId/history").get(getChatHistory);

export default router;