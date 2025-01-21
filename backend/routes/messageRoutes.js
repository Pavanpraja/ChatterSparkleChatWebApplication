import express from "express";
import { deleteAllMessages, deleteMessage, getMessages, sendMessage } from "../controllers/messageController.js";
import protectRoute from "../middleware/protectRoute.js";

const router = express.Router();

router.get("/:id", protectRoute, getMessages);
router.post("/send/:id", protectRoute, sendMessage);
router.delete("/:id", protectRoute, deleteAllMessages);
router.delete("/delete/:id", protectRoute, deleteMessage)

export default router;