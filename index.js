import http from "http";
import express from "express";
import { Server } from "socket.io";
import path from "node:path";

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

  // socket.io handlers
  io.on("connection", (socket) => {
    console.log(`Socket connected:`, { id: socket.id });
    socket.on("client:checkbox:change", (data) => {
      console.log(`[socket: ${socket.id}]: client:checkbox:change:`, data);

      io.emit("server:checkbox:change", data);
      state.checkBoxes[data.index] = data.checked;
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
