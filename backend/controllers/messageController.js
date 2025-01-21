import mongoose from "mongoose";
import Conversation from "../models/conversationModel.js";
import Message from "../models/messageModel.js";
import { getReceiverSocketId, io } from "../socket/socket.js";

export const sendMessage = async (req, res) => {
    try {
        const {message} = req.body;
        const {id: receiverId} = req.params;
        const senderId = req.user._id;
        
        // Find or create conversation same as before
        let conversation = await Conversation.findOne({
            participants: {$all: [senderId, receiverId]},
        });
        
        if(!conversation) {
            conversation = await Conversation.create({
                participants: [senderId, receiverId],
            });
        }

        // Generate a shared ObjectId for the paired messages
        const senderMessageId = new mongoose.Types.ObjectId;
        const receiverMessageId = new mongoose.Types.ObjectId;

        // Create two message objects - one for sender and one for receiver
        const senderMessage = new Message({
            _id: senderMessageId,
            senderId,
            receiverId,
            message,
            ownerId: senderId,  // This marks it as sender's copy
            pairedMessageId: receiverMessageId
        });
        console.log("senderMessage: ", senderMessage)

        const receiverMessage = new Message({
            _id: receiverMessageId,
            senderId,
            receiverId,
            message,
            ownerId: receiverId,
            pairedMessageId: senderMessageId
        });

        // Add both message IDs to conversation
        conversation.messages.push(senderMessage._id, receiverMessage._id);

        // Save everything
        await Promise.all([
            conversation.save(),
            senderMessage.save(),
            receiverMessage.save()
        ]);

        // Socket IO functionality remains same
        const receiverSocketId = getReceiverSocketId(receiverId);
        if(receiverSocketId) {
            io.to(receiverSocketId).emit("newMessage", receiverMessage);
        }

        res.status(201).json({
            senderMessage,
            receiverMessage
        });
    } catch (error) {
        console.log("Error in sendMessage controller: ", error.message);
        res.status(500).json({error: 'Internal server error'});
    }
}

// Message Controllers
export const getMessages = async (req, res) => {
    try {
        const { id: userToChatId } = req.params;
        const senderId = req.user._id;

        const conversation = await Conversation.findOne({
            participants: { $all: [senderId, userToChatId] },
        }).populate({
            path: "messages",
            match: { ownerId: senderId } // Only get messages owned by the requesting user
        });

        if (!conversation) return res.status(200).json([]);

        // Sort messages by creation date
        const messages = conversation.messages.sort((a, b) => 
            new Date(a.createdAt) - new Date(b.createdAt)
        );

        res.status(200).json(messages);
    } catch (error) {
        console.log("Error in getMessages controller: ", error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
}

// Delete chat message endpoint
export const deleteAllMessages = async (req, res) => {
    try {
      const { id } = req.params;
      const deletedMessage = await Message.findByIdAndDelete(id);
      if (!deletedMessage) {
        return res.status(404).json({ message: 'Message not found' });
      }
      return res.status(200).json({ message: 'Message deleted successfully' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }

//   delete single message 

export const deleteMessage = async (req, res) => {
    try {
        const { id: messageId } = req.params;
        const userId = req.user._id;

        // Find the message
        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ error: 'Message not found' });
        }

        // Only allow deletion if this user owns this copy of the message
        if (message.ownerId.toString() !== userId.toString()) {
            return res.status(403).json({ error: 'Unauthorized to delete this message' });
        }

        // Find the conversation
        const conversation = await Conversation.findOne({
            messages: messageId
        });

        if (conversation) {
            // Only remove this specific message ID from conversation
            conversation.messages = conversation.messages.filter(
                id => id.toString() !== messageId.toString()
            );
            await conversation.save();
        }

        // Only delete this specific message copy
        await Message.findByIdAndDelete(messageId);

        // Notify the other user through socket
        const otherUserId = message.senderId.toString() === userId.toString() 
            ? message.receiverId.toString() 
            : message.senderId.toString();

        const receiverSocketId = getReceiverSocketId(otherUserId);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("messageDeleted", messageId);
        }

        res.status(200).json({ messageId });
        
    } catch (error) {
        console.log("Error in deleteMessage controller: ", error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
};