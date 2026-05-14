/**
 * Minimal MCP stdio server for engine tests: tools `echo` and `fail_tool`.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const inputSchema = z.object({}).passthrough();

const server = new McpServer({ name: "workflow-test-echo-mcp", version: "0.0.0" });

server.registerTool(
  "echo",
  {
    title: "Echo",
    description: "Returns arguments as structuredContent.echoed",
    inputSchema,
  },
  async (args) => ({
    structuredContent: { echoed: args },
    content: [],
  })
);

server.registerTool(
  "fail_tool",
  {
    title: "Always fails",
    inputSchema,
  },
  async () => ({
    isError: true,
    content: [{ type: "text", text: "intentional tool failure" }],
  })
);

await server.connect(new StdioServerTransport());
