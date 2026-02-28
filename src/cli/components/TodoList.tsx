import React from "react";
import { Box, Text } from "ink";

export interface TodoItem {
  id: string;
  title: string;
  done: boolean;
}

interface TodoListProps {
  todos: TodoItem[];
}

export const TodoList: React.FC<TodoListProps> = ({ todos }) => {
  if (todos.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1} paddingX={1}>
      <Text bold color="blue">
        Tasks
      </Text>
      {todos.map((todo) => (
        <Text key={todo.id}>
          {todo.done ? "[x]" : "[ ]"} {todo.title}
        </Text>
      ))}
    </Box>
  );
};
