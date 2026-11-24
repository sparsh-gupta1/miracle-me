const Database = require("./database");
const WebSocket = require("./websocket");

require("dotenv").config();

const vars = require("./vars");

module.exports = {
  ...vars,
  Database,
  WebSocket,
  // FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
};
