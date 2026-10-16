# MCP Beebole

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

This **Model Context Protocol (MCP)** server allows AI assistants to interact with the **Beebole** REST API for time tracking management.

## Purpose
Enable an AI assistant to list your active projects, view your time entries, and log work hours or absences.

## Technical Stack
- Node.js (TypeScript)
- `@modelcontextprotocol/sdk`
- `axios` for HTTP requests.
- `zod` for schema validation.

## Installation

1.  Clone this repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Build the project:
    ```bash
    npm run build
    ```

## Configuration (Environment Variables)
Authentication relies on a personal Beebole API token.

- `BEEBOLE_API_TOKEN`: Your API token that you can retrieve from Beebole using the API Token module on your home screen.

---

## Usage with Claude Desktop

Add the following configuration to your `claude_desktop_config.json` file (typically located at `%APPDATA%\Claude\claude_desktop_config.json` on Windows or `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "beebole": {
      "command": "node",
      "args": ["/path/to/mcp-beebole/build/index.js"],
      "env": {
        "BEEBOLE_API_TOKEN": "YOUR_API_TOKEN"
      }
    }
  }
}
```

## Usage with Gemini CLI

There are two ways to use Beebole with Gemini CLI:

### Option 1: Gemini CLI Extension (Recommended)
This is the easiest way. It includes the MCP server and a specialized `@beebole` subagent.

1.  **Download**: Get `beebole-extension.zip` from the [latest GitHub release](https://github.com/yciabaud/mcp-beebole/releases).
2.  **Extract**: Unzip the archive to a directory of your choice.
3.  **Link**: Run the following command inside the extracted directory:
    ```bash
    gemini extensions link .
    ```
4.  **Configure**: Run `gemini settings` to enter your `BEEBOLE_API_TOKEN`.

### Option 2: Standalone MCP Server
If you prefer to add the MCP server manually to your workspace:

```bash
gemini mcp add beebole node /path/to/mcp-beebole/build/index.js -e BEEBOLE_API_TOKEN=$BEEBOLE_API_TOKEN
```

---

## Usage with Claude Desktop


Here are some ways you can interact with Beebole through your AI assistant:

### 1. Discovering your projects
**Prompt:** "What are my active projects in Beebole?"  
**Assistant Action:** Calls `list_my_projects`.  
**Result:** Displays a list of projects, subprojects, and tasks with their respective IDs.

### 2. Logging time
**Prompt:** "Log 7.5 hours on the 'Development' project for today with the comment 'Working on the MCP server'."  
**Assistant Action:** 
1. Calls `list_my_projects` to find the ID for "Development".
2. Calls `set_time_entry` with today's date, the resolved subproject ID, `7.5` hours, and the provided comment.  
**Result:** Confirmation that the entry was created or updated in Beebole.

### 3. Checking your timesheet
**Prompt:** "Show me my time entries for this week."  
**Assistant Action:** Calculates the dates for the current week and calls `get_time_entries`.  
**Result:** A summary table of all hours logged for each day of the week.

---

## Exposed Tools

1.  **`list_my_projects`**
    - Description: Returns a list of the user's active projects and tasks.
2.  **`set_time_entry`**
    - Parameters:
        - `date`: Date (format `YYYY-MM-DD`).
        - exactly one of `subproject_id`, `project_id` or `absence_id`.
        - `task_id`: (Optional) Task ID.
        - `hours`: Total hours for that row on that date.
        - `comment`: (Optional) Comment.
    - Description: Sets the total hours of one timesheet row on one date. Updates the existing entry for that row, or creates it; it never adds to existing hours.
3.  **`delete_time_entry`**
    - Parameters: `id`, `date` (`YYYY-MM-DD`).
    - Description: Deletes one time entry.
4.  **`get_time_entries`**
    - Parameters:
        - `start_date`: Start date (`YYYY-MM-DD`).
        - `end_date`: End date (`YYYY-MM-DD`).
    - Description: Lists existing time entries (with their IDs) for the given period.

## Testing
The project uses `vitest` for unit tests:
```bash
npm test
```

## Troubleshooting

### 401 Unauthorized
Ensure your `BEEBOLE_API_TOKEN` is correct. You can find it in **Beebole > Settings > Account**.

### Project/Task not found
If the assistant cannot find a project, try calling `list_my_projects` first. Only active projects and tasks are returned by the API.

### Connection issues in Claude Desktop
- Check the logs in Claude Desktop (often located in `~/Library/Logs/Claude/mcp.log` on macOS).
- Ensure `node` is in your system PATH and accessible by the Claude app.
- Make sure you ran `npm run build` to generate the `build/` folder.

## License
This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
