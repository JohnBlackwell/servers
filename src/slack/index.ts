import express, { response } from 'express';
import type { Request, Response} from 'express';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema, InitializeRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

// -------------- Slack Client --------------
class SlackClient {
  private botHeaders: { Authorization: string; "Content-Type": string };

  constructor(botToken: string) {
    this.botHeaders = {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    };
    
    console.error("SlackClient initialized with token");
  }

  async getChannels(limit: number = 100, cursor?: string): Promise<any> {
    const params = new URLSearchParams({
      types: "public_channel",
      exclude_archived: "true",
      limit: Math.min(limit, 200).toString(),
      team_id: process.env.SLACK_TEAM_ID!,
    });

    if (cursor) {
      params.append("cursor", cursor);
    }

    const response = await fetch(
      `https://slack.com/api/conversations.list?${params}`,
      { headers: this.botHeaders },
    );

    return response.json();
  }

  async postMessage(channel_id: string, text: string): Promise<any> {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: this.botHeaders,
      body: JSON.stringify({
        channel: channel_id,
        text: text,
      }),
    });

    return response.json();
  }

  async postReply(
    channel_id: string,
    thread_ts: string,
    text: string,
  ): Promise<any> {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: this.botHeaders,
      body: JSON.stringify({
        channel: channel_id,
        thread_ts: thread_ts,
        text: text,
      }),
    });

    return response.json();
  }

  async addReaction(
    channel_id: string,
    timestamp: string,
    reaction: string,
  ): Promise<any> {
    const response = await fetch("https://slack.com/api/reactions.add", {
      method: "POST",
      headers: this.botHeaders,
      body: JSON.stringify({
        channel: channel_id,
        timestamp: timestamp,
        name: reaction,
      }),
    });

    return response.json();
  }

  async getChannelHistory(
    channel_id: string,
    limit: number = 10,
  ): Promise<any> {
    const params = new URLSearchParams({
      channel: channel_id,
      limit: limit.toString(),
    });

    const response = await fetch(
      `https://slack.com/api/conversations.history?${params}`,
      { headers: this.botHeaders },
    );

    return response.json();
  }

  async getThreadReplies(channel_id: string, thread_ts: string): Promise<any> {
    const params = new URLSearchParams({
      channel: channel_id,
      ts: thread_ts,
    });

    const response = await fetch(
      `https://slack.com/api/conversations.replies?${params}`,
      { headers: this.botHeaders },
    );

    return response.json();
  }

  async getUsers(limit: number = 100, cursor?: string): Promise<any> {
    const params = new URLSearchParams({
      limit: Math.min(limit, 200).toString(),
      team_id: process.env.SLACK_TEAM_ID!,
    });

    if (cursor) {
      params.append("cursor", cursor);
    }

    const response = await fetch(`https://slack.com/api/users.list?${params}`, {
      headers: this.botHeaders,
    });

    return response.json();
  }

  async getUserProfile(user_id: string): Promise<any> {
    const params = new URLSearchParams({
      user: user_id,
      include_labels: "true",
    });

    const response = await fetch(
      `https://slack.com/api/users.profile.get?${params}`,
      { headers: this.botHeaders },
    );

    return response.json();
  }
}

// -------------- Ensure we have required env vars --------------
const botToken = process.env.SLACK_BOT_TOKEN;
const teamId = process.env.SLACK_TEAM_ID;

if (!botToken || !teamId) {
  throw new Error(
    "Please set SLACK_BOT_TOKEN and SLACK_TEAM_ID environment variables",
  );
}

// Instantiate Slack client
const slackClient = new SlackClient(botToken);

// -------------- Tool Definitions --------------
const listChannelsTool: Tool = {
  name: "slack_list_channels",
  description: "List public channels in the workspace with pagination",
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description:
          "Maximum number of channels to return (default 100, max 200)",
        default: 100,
      },
      cursor: {
        type: "string",
        description: "Pagination cursor for next page of results",
      },
    },
  },
};

const postMessageTool: Tool = {
  name: "slack_post_message",
  description: "Post a new message to a Slack channel",
  inputSchema: {
    type: "object",
    properties: {
      channel_id: {
        type: "string",
        description: "The ID of the channel to post to",
      },
      text: {
        type: "string",
        description: "The message text to post",
      },
    },
    required: ["channel_id", "text"],
  },
};

const replyToThreadTool: Tool = {
  name: "slack_reply_to_thread",
  description: "Reply to a specific message thread in Slack",
  inputSchema: {
    type: "object",
    properties: {
      channel_id: {
        type: "string",
        description: "The ID of the channel containing the thread",
      },
      thread_ts: {
        type: "string",
        description: "The timestamp of the parent message in the format '1234567890.123456'. Timestamps in the format without the period can be converted by adding the period such that 6 numbers come after it.",
      },
      text: {
        type: "string",
        description: "The reply text",
      },
    },
    required: ["channel_id", "thread_ts", "text"],
  },
};

const addReactionTool: Tool = {
  name: "slack_add_reaction",
  description: "Add a reaction emoji to a message",
  inputSchema: {
    type: "object",
    properties: {
      channel_id: {
        type: "string",
        description: "The ID of the channel containing the message",
      },
      timestamp: {
        type: "string",
        description: "The timestamp of the message to react to",
      },
      reaction: {
        type: "string",
        description: "The name of the emoji reaction (without ::)",
      },
    },
    required: ["channel_id", "timestamp", "reaction"],
  },
};

const getChannelHistoryTool: Tool = {
  name: "slack_get_channel_history",
  description: "Get recent messages from a channel",
  inputSchema: {
    type: "object",
    properties: {
      channel_id: {
        type: "string",
        description: "The ID of the channel",
      },
      limit: {
        type: "number",
        description: "Number of messages to retrieve (default 10)",
        default: 10,
      },
    },
    required: ["channel_id"],
  },
};

const getThreadRepliesTool: Tool = {
  name: "slack_get_thread_replies",
  description: "Get all replies in a message thread",
  inputSchema: {
    type: "object",
    properties: {
      channel_id: {
        type: "string",
        description: "The ID of the channel containing the thread",
      },
      thread_ts: {
        type: "string",
        description: "The timestamp of the parent message in the format '1234567890.123456'. Timestamps in the format without the period can be converted by adding the period such that 6 numbers come after it.",
      },
    },
    required: ["channel_id", "thread_ts"],
  },
};

const getUsersTool: Tool = {
  name: "slack_get_users",
  description:
    "Get a list of all users in the workspace with their basic profile information",
  inputSchema: {
    type: "object",
    properties: {
      cursor: {
        type: "string",
        description: "Pagination cursor for next page of results",
      },
      limit: {
        type: "number",
        description: "Maximum number of users to return (default 100, max 200)",
        default: 100,
      },
    },
  },
};

const getUserProfileTool: Tool = {
  name: "slack_get_user_profile",
  description: "Get detailed profile information for a specific user",
  inputSchema: {
    type: "object",
    properties: {
      user_id: {
        type: "string",
        description: "The ID of the user",
      },
    },
    required: ["user_id"],
  },
};



// -------------- Instantiate MCP server --------------
const server = new Server({
  name: "slack-mcp-server",
  version: "1.0.0"
}, {
  capabilities: {
    tools: {}
  }
});

// -------------- Register Tools --------------
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error("Received listTools request");
  return {
    tools: [
      listChannelsTool, 
      postMessageTool, 
      replyToThreadTool, 
      addReactionTool, 
      getChannelHistoryTool, 
      getThreadRepliesTool, 
      getUsersTool, 
      getUserProfileTool
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request: { params: { name: string; arguments?: any } }) => {
  const { name, arguments: args } = request.params;
  console.error(`Received tool call: ${name} with args:`, args);

  if (!args) {
    throw new Error(`No arguments provided for tool: ${name}`);
  }

  switch (name) {
    case "slack_list_channels": {
      const { limit, cursor } = args as {
        limit?: number;
        cursor?: string;
      };
      console.error(`Getting channels with limit=${limit}, cursor=${cursor}`);
      
      try {
        const result = await slackClient.getChannels(limit, cursor);
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify(result) 
          }]
        };
      } catch (error) {
        console.error("Error getting channels:", error);
        throw error;
      }
    }

    case "slack_post_message": {
      const { channel_id, text } = args as {
        channel_id: string;
        text: string;
      };
      if (!channel_id || !text) {
        throw new Error("Missing required arguments: channel_id and text are required");
      }
      console.error(`Posting message to channel ${channel_id}: ${text}`);
      
      try {
        const result = await slackClient.postMessage(channel_id, text);
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify(result) 
          }]
        };
      } catch (error) {
        console.error("Error posting message:", error);
        throw error;
      } 
    }

    case "slack_reply_to_thread": {
      const { channel_id, thread_ts, text } = args as {
        channel_id: string;
        thread_ts: string;
        text: string;
      }; 
      if (!channel_id || !thread_ts || !text) {
        throw new Error("Missing required arguments: channel_id, thread_ts, and text are required");
      }
      console.error(`Replying to thread in channel ${channel_id} at timestamp ${thread_ts}: ${text}`);

      try {
        const result = await slackClient.postReply(channel_id, thread_ts, text);
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify(result) 
          }]
        };
      } catch (error) {
        console.error("Error replying to thread:", error);
        throw error;
      }
    }

    case "slack_add_reaction": {
      const { channel_id, timestamp, reaction } = args as {
        channel_id: string;
        timestamp: string;
        reaction: string;
      };
      if (!channel_id || !timestamp || !reaction) {
        throw new Error("Missing required arguments: channel_id, timestamp, and reaction are required");
      }
      console.error(`Adding reaction ${reaction} to message in channel ${channel_id} at timestamp ${timestamp}`);

      try {
        const result = await slackClient.addReaction(channel_id, timestamp, reaction);
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify(result) 
          }] 
        };
      } catch (error) {
        console.error("Error adding reaction:", error);
        throw error;
      }
    }

    case "slack_get_channel_history": {
      const { channel_id, limit } = args as {
        channel_id: string;
        limit: number;
      };
      if (!channel_id) {
        throw new Error("Missing required argument: channel_id");
      }
      console.error(`Getting channel history for channel ${channel_id} with limit ${limit}`);

      try {
        const result = await slackClient.getChannelHistory(channel_id, limit);
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify(result) 
          }]
        };
      } catch (error) {
        console.error("Error getting channel history:", error);
        throw error;
      }
    } 

    case "slack_get_thread_replies": {
      const { channel_id, thread_ts } = args as {
        channel_id: string;
        thread_ts: string;
      };
      if (!channel_id || !thread_ts) {
        throw new Error("Missing required arguments: channel_id and thread_ts are required");
      }
      console.error(`Getting replies for thread in channel ${channel_id} at timestamp ${thread_ts}`);

      try {
        const result = await slackClient.getThreadReplies(channel_id, thread_ts);
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify(result) 
          }]
        };
      } catch (error) {
        console.error("Error getting thread replies:", error);
        throw error;
      }
    }

    case "slack_get_users": {
      const { limit, cursor } = args as {
        limit?: number;
        cursor?: string;
      };
      console.error(`Getting users with limit=${limit}, cursor=${cursor}`);

      try {
        const result = await slackClient.getUsers(limit, cursor);
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify(result) 
          }]
        };  
      } catch (error) {
        console.error("Error getting users:", error);
        throw error;
      }
    }

    case "slack_get_user_profile": {
      const { user_id } = args as {
        user_id: string;
      };
      if (!user_id) {
        throw new Error("Missing required argument: user_id");
      }
      console.error(`Getting user profile for user ${user_id}`);

      try {
        const result = await slackClient.getUserProfile(user_id);
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify(result) 
          }]
        }; 
      } catch (error) {
        console.error("Error getting user profile:", error);
        throw error;
      }
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// -------------- Express / SSE Setup --------------
const app = express();

// For multiple simultaneous connections, map from sessionId to SSE transport
const transports: { [sessionId: string]: SSEServerTransport } = {};

// Add a basic health check route
app.get("/", (req, res) => {
  res.send("Slack MCP Server is running");
});

// Debug route to check the environment
app.get("/debug", (req, res) => {
  res.json({
    env: {
      SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
      SLACK_TEAM_ID: process.env.SLACK_TEAM_ID,
      PORT: process.env.PORT || 3000
    },
    transports: Object.keys(transports).length,
    serverInfo: {
      name: "slack-mcp-server",
      version: "1.0.0"
    }
  });
});

// SSE endpoint
app.get("/sse", async (_: Request, res: Response) => {
  try {
    const transport = new SSEServerTransport('/messages', res);
    transports[transport.sessionId] = transport;
    res.on("close", () => {
      delete transports[transport.sessionId];
    });
    await server.connect(transport);
  } catch (err) {
    console.error("Error during server.connect:", err);
    res.status(500).send("Internal server error");
  }
});

app.post("/messages", async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports[sessionId];
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send('No transport found for sessionId');
  }
});

// -------------- Start the server --------------
const PORT = process.env.PORT || 3000; // Use a different port than 3001
app.listen(PORT, () => {
  console.error(`Slack MCP Server running on port ${PORT}`);
});
