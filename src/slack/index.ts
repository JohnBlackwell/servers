import express, { Request, Response } from "express";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";


// -------------- Slack Client --------------
class SlackClient {
  private botHeaders: { Authorization: string; "Content-Type": string };

  constructor(botToken: string) {
    this.botHeaders = {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    };
  }

  async getChannels(limit = 100, cursor?: string): Promise<any> {
    const params = new URLSearchParams({
      types: "public_channel",
      exclude_archived: "true",
      limit: Math.min(limit, 200).toString(),
      team_id: process.env.SLACK_TEAM_ID || "",
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
      body: JSON.stringify({ channel: channel_id, text }),
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
      body: JSON.stringify({ channel: channel_id, thread_ts, text }),
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
      body: JSON.stringify({ channel: channel_id, timestamp, name: reaction }),
    });
    return response.json();
  }

  async getChannelHistory(channel_id: string, limit = 10): Promise<any> {
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
    const params = new URLSearchParams({ channel: channel_id, ts: thread_ts });
    const response = await fetch(
      `https://slack.com/api/conversations.replies?${params}`,
      { headers: this.botHeaders },
    );
    return response.json();
  }

  async getUsers(limit = 100, cursor?: string): Promise<any> {
    const params = new URLSearchParams({
      limit: Math.min(limit, 200).toString(),
      team_id: process.env.SLACK_TEAM_ID || "",
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
        description:
          "Timestamp of the parent message in the format '1234567890.123456'",
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
        description:
          "Timestamp of the parent message in the format '1234567890.123456'",
      },
    },
    required: ["channel_id", "thread_ts"],
  },
};

const getUsersTool: Tool = {
  name: "slack_get_users",
  description:
    "Get a list of all users in the workspace with basic profile information",
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
const server = new McpServer({
  name: "example-server",
  version: "1.0.0"
});


// -------------- Register Tools --------------

server.tool(
  "slack_list_channels",
  new ResourceTemplateSchema("")
  z.object({
    limit: z.number().default(100),
    cursor: z.string().optional(),
  }),
  async ({ limit, cursor }) => {
    // Call your Slack client
    const responseContent = await slackClient.getChannels(limit, cursor);

    // Return the result in the standard "content" format
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(responseContent),
        },
      ],
    };
  }
);

// server.addTool(postMessageTool, async (invocation) => {
//   const { channel_id, text } = invocation.input as {
//     channel_id: string;
//     text: string;
//   };
//   return slackClient.postMessage(channel_id, text);
// });

// server.addTool(replyToThreadTool, async (invocation) => {
//   const { channel_id, thread_ts, text } = invocation.input as {
//     channel_id: string;
//     thread_ts: string;
//     text: string;
//   };
//   return slackClient.postReply(channel_id, thread_ts, text);
// });

// server.addTool(addReactionTool, async (invocation) => {
//   const { channel_id, timestamp, reaction } = invocation.input as {
//     channel_id: string;
//     timestamp: string;
//     reaction: string;
//   };
//   return slackClient.addReaction(channel_id, timestamp, reaction);
// });

// server.addTool(getChannelHistoryTool, async (invocation) => {
//   const { channel_id, limit } = invocation.input as {
//     channel_id: string;
//     limit?: number;
//   };
//   return slackClient.getChannelHistory(channel_id, limit);
// });

// server.addTool(getThreadRepliesTool, async (invocation) => {
//   const { channel_id, thread_ts } = invocation.input as {
//     channel_id: string;
//     thread_ts: string;
//   };
//   return slackClient.getThreadReplies(channel_id, thread_ts);
// });

// server.addTool(getUsersTool, async (invocation) => {
//   const { limit, cursor } = invocation.input as {
//     limit?: number;
//     cursor?: string;
//   };
//   return slackClient.getUsers(limit, cursor);
// });

// server.addTool(getUserProfileTool, async (invocation) => {
//   const { user_id } = invocation.input as {
//     user_id: string;
//   };
//   return slackClient.getUserProfile(user_id);
// });

// -------------- Express / SSE Setup --------------
const app = express();
app.use(express.json());

// For multiple simultaneous connections, map from sessionId to SSE transport
const transports: { [sessionId: string]: SSEServerTransport } = {};

app.get("/sse", async (_: Request, res: Response) => {
  const transport = new SSEServerTransport("/messages", res);
  transports[transport.sessionId] = transport;
  res.on("close", () => {
    delete transports[transport.sessionId];
  });
  await server.connect(transport);
});

app.post("/messages", async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports[sessionId];
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("No transport found for sessionId");
  }
});

// -------------- Start the server --------------
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Slack MCP Server running on port ${PORT}`);
});
