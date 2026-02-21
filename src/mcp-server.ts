import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use the exact same database as the main app
const dbPath = path.join(__dirname, "..", "fueltrack_v2.db");
const db = new Database(dbPath);

const server = new Server(
  {
    name: "fueltrack-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define the tools we expose to Claude
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_branches",
        description: "Get all fuel station branches and their locations",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "get_active_shifts",
        description: "Get the currently active shift and shift data for a specific branch",
        inputSchema: {
          type: "object",
          properties: {
            branch_id: {
              type: "string",
              description: "The ID of the branch (e.g., 'br-yola', 'br-gombi')",
            },
          },
          required: ["branch_id"],
        },
      },
      {
        name: "get_pending_expenses",
        description: "Get all pending expenses across all branches that need manager approval",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    ],
  };
});

// Implement the actual tool logic
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case "get_branches": {
        const branches = db.prepare("SELECT * FROM branches").all();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(branches, null, 2),
            },
          ],
        };
      }

      case "get_active_shifts": {
        const branchId = request.params.arguments?.branch_id;
        if (!branchId || typeof branchId !== "string") {
          throw new Error("branch_id string is required");
        }

        const shift = db.prepare("SELECT * FROM shifts WHERE branch_id = ? AND status = 'OPEN'").get() as any;
        if (!shift) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: "No active shift found for this branch" }) }],
          };
        }

        const data = db.prepare(`
          SELECT sd.*, a.name as attendant_name 
          FROM shift_data sd
          JOIN attendants a ON sd.attendant_id = a.id
          WHERE sd.shift_id = ?
        `).all(shift.id);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ shift, data }, null, 2),
            },
          ],
        };
      }

      case "get_pending_expenses": {
        const expenses = db.prepare(`
          SELECT e.*, a.name as attendant_name, sd.shift_id, b.name as branch_name
          FROM expenses e
          JOIN shift_data sd ON e.shift_data_id = sd.id
          JOIN attendants a ON sd.attendant_id = a.id
          JOIN branches b ON a.branch_id = b.id
          WHERE e.status = 'PENDING'
        `).all();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(expenses, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error executing tool: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server using stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("FuelTrack MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
