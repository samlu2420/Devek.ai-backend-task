"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = require("ws");
const ioredis_1 = __importDefault(require("ioredis"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
dotenv_1.default.config();
const port = 1234;
const wss = new ws_1.WebSocketServer({ port });
//rdis client
const redis = new ioredis_1.default({
    host: 'redis-18319.c322.us-east-1-2.ec2.redns.redis-cloud.com',
    port: 18319,
    password: 'hicUmudlgVjZ5KjbP5DSl5a2LtqPHOXC'
});
//express app
const app = (0, express_1.default)();
const apiPort = 3000;
app.use((0, cors_1.default)());
function validateLoggingUserAction(event) {
    if (!event.userId) {
        throw new Error('Invalid userId');
    }
    if (!event.eventType || !['login', 'logout', 'file_open', 'file_save'].includes(event.eventType)) {
        throw new Error('Invalid event type');
    }
    if (isNaN(new Date(event.timestamp).getTime())) {
        throw new Error('Invalid timestamp');
    }
}
async function loggingUserAction(event) {
    // validate event
    validateLoggingUserAction(event);
    // log event
    console.log(`User ${event.userId} ${event.eventType} at ${event.timestamp}`);
    event.timestampServer = new Date();
    console.log(`Event received: ${JSON.stringify(event)}`);
    // store event in Redis
    await redis.lpush('user_actions', JSON.stringify(event));
    console.log('Event stored in Redis');
}
let receiveUpdates = true;
wss.on("connection", ws => {
    console.log('New client connected');
    ws.on("message", async (data) => {
        try {
            const event = JSON.parse(data.toString());
            await loggingUserAction(event);
            const message = `${event.userId} just ${event.eventType} at ${event.timestamp}`;
            if (receiveUpdates) {
                ws.send(message);
            }
        }
        catch (error) {
            console.error('Error:', error);
            if (error instanceof Error) {
                ws.send(`Error: ${error.message}`);
            }
            else {
                ws.send(`Error: ${String(error)}`);
            }
        }
    });
    ws.on("close", () => {
        console.log('Client disconnected');
    });
});
console.log(`WebSocket server is running on ws://localhost:${port}`);
// API endpoint to get the last 10 actions for a given user
app.get('/event/recent', async (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
        res.status(400).json({ error: 'User ID is required' });
    }
    try {
        const events = await redis.lrange('user_actions', 0, -1);
        const userEvents = events
            .map(event => {
            try {
                return JSON.parse(event);
            }
            catch (e) {
                console.error('Error parsing event:', e);
                return null;
            }
        })
            .filter((event) => event && event.userId === userId)
            .sort((a, b) => new Date(b.timestampServer).getTime() - new Date(a.timestampServer).getTime())
            .slice(0, 10);
        res.json(userEvents);
    }
    catch (error) {
        console.error('Error retrieving events:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.listen(apiPort, () => {
    console.log(`Server is running at http://localhost:${apiPort}`);
});
