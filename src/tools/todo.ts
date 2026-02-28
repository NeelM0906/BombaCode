import { BaseTool } from "./base-tool.js";

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoItem {
  content: string;
  status: TodoStatus;
}

export type TodoUpdateHandler = (todos: TodoItem[]) => void;

function isTodoStatus(value: unknown): value is TodoStatus {
  return value === "pending" || value === "in_progress" || value === "completed";
}

function parseTodos(input: unknown): TodoItem[] | null {
  if (!Array.isArray(input)) {
    return null;
  }

  const todos: TodoItem[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") {
      return null;
    }

    const content = (item as { content?: unknown }).content;
    const status = (item as { status?: unknown }).status;

    if (typeof content !== "string" || !isTodoStatus(status)) {
      return null;
    }

    todos.push({ content, status });
  }

  return todos;
}

export class TodoTool extends BaseTool {
  name = "todo";
  description = "Create and manage a task list to track progress on complex multi-step tasks.";
  category = "interactive" as const;
  inputSchema = {
    type: "object",
    properties: {
      todos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            content: { type: "string" },
            status: { type: "string", enum: ["pending", "in_progress", "completed"] },
          },
          required: ["content", "status"],
          additionalProperties: false,
        },
      },
    },
    required: ["todos"],
    additionalProperties: false,
  };

  private todos: TodoItem[] = [];
  private readonly onUpdate?: TodoUpdateHandler;

  constructor(onUpdate?: TodoUpdateHandler) {
    super();
    this.onUpdate = onUpdate;
  }

  getTodos(): TodoItem[] {
    return [...this.todos];
  }

  async run(input: Record<string, unknown>) {
    const todos = parseTodos(input.todos);

    if (!todos) {
      return {
        content: "Error: Invalid todo payload. Expected todos: [{ content, status }].",
        isError: true,
      };
    }

    this.todos = todos;
    this.onUpdate?.(this.getTodos());

    const completed = todos.filter((todo) => todo.status === "completed").length;
    const inProgress = todos.filter((todo) => todo.status === "in_progress").length;

    return {
      content: `Updated todo list with ${todos.length} items (${completed} completed, ${inProgress} in progress)`,
      isError: false,
    };
  }
}
