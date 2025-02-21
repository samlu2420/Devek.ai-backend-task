import { WebSocketServer } from "ws";
import Redis from "ioredis";
import dotenv from "dotenv";
import cors from 'cors';
import express, { Request, Response } from 'express';

dotenv.config();

const port = 1234;
const wss = new WebSocketServer({ port });

//rdis client
const redis = new Redis({
    host: 'redis-18319.c322.us-east-1-2.ec2.redns.redis-cloud.com',
    port: 18319,
    password: 'hicUmudlgVjZ5KjbP5DSl5a2LtqPHOXC'
});

//express app
const app = express();
const apiPort = 3000;
app.use(cors());

//set up interface
interface UserAction {
    timestamp: Date;
    userId: string;
    eventType: 'login' | 'logout' | 'file_open' | 'file_save';
    timestampServer: Date;
}

function validateLoggingUserAction(event: UserAction) {
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

async function loggingUserAction(event: UserAction) {
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
            const event: UserAction = JSON.parse(data.toString());
            await loggingUserAction(event);
            const message = `${event.userId} just ${event.eventType} at ${event.timestamp}`;
            if (receiveUpdates) {
                ws.send(message);
            }
        } catch (error) {
            console.error('Error:', error);
            if (error instanceof Error) {
                ws.send(`Error: ${error.message}`);
            } else {
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
app.get('/event/recent', async (req: Request, res: Response): Promise<void> => {
    const userId = req.query.userId as string;
    if (!userId) {
        res.status(400).json({ error: 'User ID is required' });
    }

    try {
        const events = await redis.lrange('user_actions', 0, -1);
        const userEvents = events
            .map(event => {
                try {
                    return JSON.parse(event);
                } catch (e) {
                    console.error('Error parsing event:', e);
                    return null;
                }
            })
            .filter((event: UserAction | null) => event && event.userId === userId)
            .sort((a, b) => new Date(b.timestampServer).getTime() - new Date(a.timestampServer).getTime())
            .slice(0, 10);
        res.json(userEvents);
    } catch (error) {
        console.error('Error retrieving events:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(apiPort, () => {
    console.log(`Server is running at http://localhost:${apiPort}`);
});
