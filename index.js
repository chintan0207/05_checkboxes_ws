import http from "http";
import express from "express";
import { Server } from "socket.io";
import path from "node:path";

import { publisher, redis, subscriber } from "./redis-conection.js";
import { channel } from "node:diagnostics_channel";

const CHECKBOX_COUNT = 200;
const CHECKBOX_STATE_KEY = "checkbox-state";
const rateLimitHashMap = new Map();

const state = {
  checkBoxes: new Array(CHECKBOX_COUNT).fill(false),
};

async function main() {
  const PORT = process.env.PORT ?? 8000;

  const app = express();
  const server = http.createServer(app);

  const io = new Server();
  io.attach(server);

  subscriber.subscribe("internal-server:checkbox:change");
  subscriber.on(`message`, (channel, message) => {
    if (channel === "internal-server:checkbox:change") {
      const { index, checked } = JSON.parse(message);
      state.checkBoxes[index] = checked;
      io.emit("server:checkbox:change", { index, checked });
    }
  });

  // socket.io handlers
  io.on("connection", async (socket) => {
    console.log(`Socket connected:`, { id: socket.id });
    socket.on("client:checkbox:change", async (data) => {
      console.log(`[socket: ${socket.id}]: client:checkbox:change:`, data);

      const lastOperationTime = await redis.get(`rate-limit:${socket.id}`);

      if (lastOperationTime) {
        const timeElapsed = Date.now() - lastOperationTime;
        if (timeElapsed < 2000) {
          console.log(
            `[socket: ${socket.id}]: Rate limit exceeded. Time elapsed: ${timeElapsed}ms`,
          );
          socket.emit("server:error", {
            message:
              "Rate limit exceeded. Please wait before making another change.",
          });
          return;
        }
      }

      await redis.set(`rate-limit:${socket.id}`, Date.now());

      const existingState = await publisher.get(CHECKBOX_STATE_KEY);

      if (existingState) {
        const remoteData = JSON.parse(existingState);
        remoteData[data.index] = data.checked;
        await redis.set(CHECKBOX_STATE_KEY, JSON.stringify(remoteData));
      } else {
        const checkBoxes = new Array(CHECKBOX_COUNT).fill(false);
        await redis.set(CHECKBOX_STATE_KEY, JSON.stringify(checkBoxes));
      }

      await publisher.publish(
        "internal-server:checkbox:change",
        JSON.stringify(data),
      );
    });
  });

  // express handlers
  app.use(express.static(path.resolve("./public")));
  app.get("/health", (req, res) => {
    res.status(200).json({ healthy: true });
  });

  app.get(`/checkboxes`, async (req, res) => {
    const existingState = await redis.get(CHECKBOX_STATE_KEY);
    if (existingState) {
      const remoteData = JSON.parse(existingState);
      return res.json({ checkboxes: remoteData });
    }
    return res.json({ checkboxes: new Array(CHECKBOX_COUNT).fill(false) });
  });

  server.listen(PORT, () => {
    console.log(`Server is running on port http://localhost:${PORT} `);
  });
}

main();
