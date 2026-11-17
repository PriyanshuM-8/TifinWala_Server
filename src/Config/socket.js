import { Server } from "socket.io";

let io = null;

/**
 * Initializes Socket.IO on the provided Node.js HTTP server.
 */
export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: "*", // Allows customer, chef, and admin panels
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket) => {
    // Client joins their personal user room (user_<userId>) and chef room (chef_<userId>)
    const handleJoinUser = (userId) => {
      if (!userId) return;
      const ids = Array.isArray(userId) ? userId : [userId];
      ids.forEach((id) => {
        if (id) {
          const idStr = id.toString();
          socket.join(`user_${idStr}`);
          socket.join(`chef_${idStr}`);
        }
      });
    };
    socket.on("join", handleJoinUser);
    socket.on("join_user", handleJoinUser);
    socket.on("join_chef", handleJoinUser);

    // Client joins a specific order room (order_<orderId>) for live status updates
    socket.on("join_order", (orderId) => {
      if (orderId) {
        const roomName = `order_${orderId.toString()}`;
        socket.join(roomName);
      }
    });

    socket.on("leave_order", (orderId) => {
      if (orderId) {
        const roomName = `order_${orderId.toString()}`;
        socket.leave(roomName);
      }
    });

    socket.on("disconnect", () => {
      // Clean disconnect
    });
  });

  return io;
};

/**
 * Returns active Socket.IO server instance.
 */
export const getIO = () => {
  return io;
};

/**
 * Sends a real-time event directly to a specific user (Customer or Chef).
 * Guaranteed to target ONLY the intended recipient room.
 */
export const notifyUser = (userId, eventName, payload) => {
  if (!io || !userId) return;
  const idStr = userId.toString();
  io.to(`user_${idStr}`).emit(eventName, payload);
  io.to(`chef_${idStr}`).emit(eventName, payload);
};

/**
 * Sends a real-time event to everyone monitoring a specific order.
 */
export const notifyOrder = (orderId, eventName, payload) => {
  if (!io || !orderId) return;
  const roomName = `order_${orderId.toString()}`;
  io.to(roomName).emit(eventName, payload);
};
