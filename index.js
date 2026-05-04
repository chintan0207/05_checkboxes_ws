import http from "http";
import express from "express";
import { Server } from "socket.io";
import path from "node:path";

import { publisher, subscriber } from "./redis-conection.js";
import { channel } from "node:diagnostics_channel";

const CHECKBOX_COUNT = 200;

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

  app.get(`/checkboxes`, (req, res) => {
    return res.json({ checkboxes: state.checkBoxes });
  });

  server.listen(PORT, () => {
    console.log(`Server is running on port http://localhost:${PORT} `);
  });
}

main();
