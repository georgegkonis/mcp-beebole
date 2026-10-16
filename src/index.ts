import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import * as dotenv from "dotenv";
import { BeeboleClient } from "./beebole.js";

dotenv.config();

const BEEBOLE_API_TOKEN = process.env.BEEBOLE_API_TOKEN;
if (!BEEBOLE_API_TOKEN) {
  console.error("Warning: BEEBOLE_API_TOKEN environment variable is missing. Tools will not work until it is provided in the configuration.");
}

const beebole = new BeeboleClient(BEEBOLE_API_TOKEN || "");
const server = new Server({ name: "mcp-beebole", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_my_projects",
        description: "List active projects and tasks where time can be logged.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "list_absence_types",
        description: "List available absence types (Vacation, Sick Leave, etc.).",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "set_time_entry",
        description: "Set the TOTAL hours of one timesheet row on one date (overwrites, does not add). Updates the existing entry for that row/date or creates it. Provide exactly one of subproject_id, project_id or absence_id; use the IDs and levels shown by list_my_projects (📄 = subproject, 📁 = project).",
        inputSchema: {
          type: "object",
          properties: {
            date: { type: "string", description: "Date (YYYY-MM-DD)" },
            subproject_id: { type: "string", description: "ID of a subproject (📄)" },
            project_id: { type: "string", description: "ID of a project (📁), only for rows logged directly on a project" },
            absence_id: { type: "string", description: "ID of the absence type" },
            task_id: { type: "string", description: "Optional task ID (not with absence_id)" },
            hours: { type: "number", description: "Total hours for this row on this date" },
            comment: { type: "string", description: "Optional comment" },
          },
          required: ["date", "hours"],
        },
      },
      {
        name: "delete_time_entry",
        description: "Delete a single time entry by ID (from get_time_entries) and its date.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Time entry ID" },
            date: { type: "string", description: "Date of the entry (YYYY-MM-DD)" },
          },
          required: ["id", "date"],
        },
      },
      {
        name: "get_time_entries",
        description: "Get time entries for a given period.",
        inputSchema: {
          type: "object",
          properties: {
            start_date: { type: "string", description: "Start date (YYYY-MM-DD)" },
            end_date: { type: "string", description: "End date (YYYY-MM-DD)" },
          },
          required: ["start_date", "end_date"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (!BEEBOLE_API_TOKEN) {
    return {
      content: [{ 
        type: "text", 
        text: "Error: BEEBOLE_API_TOKEN is not configured. Please set it in your MCP server configuration (e.g., in Claude Desktop or Gemini CLI settings)." 
      }],
      isError: true
    };
  }
  const { name, arguments: args } = request.params;
  try {
    if (name === "list_my_projects") {
      const companies = await beebole.listCompanies();
      const projects = await beebole.listProjects(companies.map(c => c.id));
      const subprojects = await beebole.listSubprojects(projects.map(p => p.id));
      const tasks = await beebole.listTasks();
      
      const resultLines: string[] = ["### Hierarchical View of Projects and Tasks\n"];
      
      const projectMap = new Map<string, any[]>();
      projects.forEach((p: any) => {
        const id = p.companyId;
        if (id) {
          if (!projectMap.has(id)) projectMap.set(id, []);
          projectMap.get(id)!.push(p);
        }
      });
      
      const subprojectMap = new Map<string, any[]>();
      subprojects.forEach((s: any) => {
        const id = s.projectId;
        if (id) {
          if (!subprojectMap.has(id)) subprojectMap.set(id, []);
          subprojectMap.get(id)!.push(s);
        }
      });
      
      const taskMap = new Map<string, any[]>();
      tasks.forEach((t: any) => {
        const id = t.subprojectId || t.projectId || t.companyId;
        if (id) {
          if (!taskMap.has(id)) taskMap.set(id, []);
          taskMap.get(id)!.push(t);
        }
      });
      
      const displayedIds = new Set<string>();
      
      companies.forEach((c: any) => {
        resultLines.push(`🏢 [${c.id}] ${c.name}`);
        displayedIds.add(c.id);
        
        (projectMap.get(c.id) || []).forEach((p: any) => {
          resultLines.push(`  📁 [${p.id}] ${p.name}`);
          displayedIds.add(p.id);
          
          (subprojectMap.get(p.id) || []).forEach((s: any) => {
            resultLines.push(`    📄 [${s.id}] ${s.name}`);
            displayedIds.add(s.id);
            
            (taskMap.get(s.id) || []).forEach((t: any) => {
              resultLines.push(`      🔧 [${t.id}] ${t.name}`);
              displayedIds.add(t.id);
            });
          });
          
          (taskMap.get(p.id) || []).forEach((t: any) => {
            if (!displayedIds.has(t.id)) {
              resultLines.push(`    🔧 [${t.id}] ${t.name}`);
              displayedIds.add(t.id);
            }
          });
        });
        
        (taskMap.get(c.id) || []).forEach((t: any) => {
          if (!displayedIds.has(t.id)) {
            resultLines.push(`  🔧 [${t.id}] ${t.name}`);
            displayedIds.add(t.id);
          }
        });
      });
      
      return { content: [{ type: "text", text: resultLines.join("\n") }] };
    }

    if (name === "list_absence_types") {
      const companies = await beebole.listCompanies();
      const absences = await beebole.listAbsenceTypes(companies.map(c => c.id));
      let text = "### Available Absence Types\n\n";
      absences.forEach((a: any) => { text += `- [${a.id}] ${a.name}\n`; });
      return { content: [{ type: "text", text }] };
    }

    if (name === "set_time_entry") {
      const entry = z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        subproject_id: z.string().optional(),
        project_id: z.string().optional(),
        absence_id: z.string().optional(),
        task_id: z.string().optional(),
        hours: z.number().min(0).max(24),
        comment: z.string().optional(),
      }).refine(d => [d.subproject_id, d.project_id, d.absence_id].filter(Boolean).length === 1, {
        message: "Provide exactly one of subproject_id, project_id or absence_id",
      }).refine(d => !(d.absence_id && d.task_id), { message: "task_id cannot be used with absence_id" }).parse(args);

      const result = await beebole.setTimeEntry(entry);
      const entryData = result.time_entry || result.timeEntry || {};
      const statusMap: Record<string, string> = {
        'd': 'Draft',
        'n': 'Not Submitted',
        's': 'Submitted',
        'a': 'Approved',
        'r': 'Rejected'
      };
      const entryStatus = statusMap[entryData.status] || entryData.status || 'unknown';

      return { content: [{ type: "text", text: `Time entry ${result.action} for ${entry.date}: ${entry.hours}h (id ${entryData.id ?? "?"}, status: ${entryStatus}).` }] };
    }

    if (name === "delete_time_entry") {
      const params = z.object({
        id: z.string().min(1),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }).parse(args);
      await beebole.deleteTimeEntry(params.id, params.date);
      return { content: [{ type: "text", text: `Deleted time entry ${params.id} on ${params.date}.` }] };
    }

    if (name === "get_time_entries") {
      const params = z.object({
        start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Invalid start_date format, use YYYY-MM-DD" }),
        end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Invalid end_date format, use YYYY-MM-DD" })
      }).parse(args);
      
      const entries = await beebole.getTimeEntries(params.start_date, params.end_date);
      if (!entries || entries.length === 0) return { content: [{ type: "text", text: "No entries found." }] };

      // Fetch full hierarchy to enrich names
      const companies = await beebole.listCompanies();
      const projects = await beebole.listProjects(companies.map(c => c.id));
      const subprojects = await beebole.listSubprojects(projects.map(p => p.id));

      const companyMap = new Map(companies.map(c => [String(c.id), c]));
      const projectMap = new Map(projects.map(p => [String(p.id), p]));
      const subprojectMap = new Map(subprojects.map(s => [String(s.id), s]));

      let text = `Time Entries from ${params.start_date} to ${params.end_date}:\n\n`;
      entries.forEach((e: any) => {
        const hours = e.hours || 0;
        
        // Try to get names from entry or from our hierarchy maps
        let c_id = e.company?.id ? String(e.company.id) : null;
        let p_id = e.project?.id ? String(e.project.id) : null;
        let s_id = e.subproject?.id ? String(e.subproject.id) : null;

        let companyName = e.company?.name || "";
        let projectName = e.project?.name || "";
        let subprojectName = e.subproject?.name || "";
        const taskName = e.task?.name || "";
        const absenceName = e.absence?.name || "";

        // Enrichment logic: follow the chain up
        if (s_id && subprojectMap.has(s_id)) {
          const s = subprojectMap.get(s_id);
          subprojectName = subprojectName || s.name;
          if (!p_id) p_id = s.projectId;
        }
        if (p_id && projectMap.has(p_id)) {
          const p = projectMap.get(p_id);
          projectName = projectName || p.name;
          if (!c_id) c_id = p.companyId;
        }
        if (c_id && companyMap.has(c_id)) {
          companyName = companyName || companyMap.get(c_id).name;
        }

        let ctx = "";
        if (absenceName) {
          ctx = `Absence: ${absenceName}`;
        } else {
          const header = [companyName, projectName].filter(Boolean).join(": ");
          const detail = [subprojectName, taskName].filter(Boolean).join(" > ");
          ctx = header ? `**${header}**` : "";
          if (detail) ctx += (ctx ? " " : "") + detail;
        }

        text += `- [${e.id}] ${e.date}: ${hours}h on ${ctx || "Unknown"}${e.comment ? ` - ${e.comment}` : ""}\n`;
      });
      return { content: [{ type: "text", text }] };
    }
    throw new Error(`Tool not found: ${name}`);
  } catch (error: any) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Beebole MCP server running on stdio");
}

if (import.meta.url.endsWith("index.js") || import.meta.url.endsWith("index.ts")) {
  main().catch(error => { console.error("Server error:", error); process.exit(1); });
}

export { server, beebole };
