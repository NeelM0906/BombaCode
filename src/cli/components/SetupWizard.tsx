import React, { useCallback, useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { saveSettings } from "../../memory/settings.js";
import { createProvider } from "../../llm/provider-factory.js";
import type { Settings } from "../../memory/settings.js";

type WizardStep = "welcome" | "provider" | "apikey" | "model" | "cost" | "testing" | "done";

type ProviderType = Settings["provider"];

type ModelOption = {
  value: string;
  label: string;
};

const PROVIDER_OPTIONS: Array<{ value: ProviderType; label: string; desc: string }> = [
  {
    value: "openrouter",
    label: "OpenRouter",
    desc: "Frontier models through one API key",
  },
  {
    value: "openai-compat",
    label: "LiteLLM / OpenAI-compatible",
    desc: "Use a local or self-hosted OpenAI-compatible endpoint",
  },
  {
    value: "anthropic",
    label: "Anthropic Direct",
    desc: "Direct Claude API access",
  },
];

const MODEL_OPTIONS: Record<ProviderType, ModelOption[]> = {
  openrouter: [
    { value: "anthropic/claude-opus-4-6", label: "Claude Opus 4.6 (powerful)" },
    { value: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6 (balanced)" },
    { value: "anthropic/claude-haiku-4-5", label: "Claude Haiku 4.5 (fast)" },
    { value: "openai/gpt-5", label: "GPT-5" },
    { value: "deepseek/deepseek-r1", label: "DeepSeek R1" },
  ],
  "openai-compat": [
    { value: "gpt-4.1", label: "gpt-4.1 (LiteLLM default)" },
    { value: "claude-sonnet-4-6", label: "claude-sonnet-4-6" },
    { value: "deepseek-r1", label: "deepseek-r1" },
  ],
  anthropic: [
    { value: "claude-opus-4-6", label: "Claude Opus 4.6 (powerful)" },
    { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (balanced)" },
    { value: "claude-haiku-4-5", label: "Claude Haiku 4.5 (fast)" },
  ],
};

const COST_OPTIONS: Array<{ value: Settings["costMode"]; label: string; description: string }> = [
  {
    value: "quality-first",
    label: "quality-first",
    description: "Prefer the strongest model and larger responses",
  },
  {
    value: "balanced",
    label: "balanced",
    description: "Balance quality and cost per request",
  },
  {
    value: "cost-first",
    label: "cost-first",
    description: "Prefer cheaper and faster models",
  },
];

interface SetupWizardProps {
  onComplete: (settings: Settings) => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
  const { exit } = useApp();

  const [step, setStep] = useState<WizardStep>("welcome");
  const [providerIndex, setProviderIndex] = useState(0);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("http://localhost:4000/v1");
  const [modelIndex, setModelIndex] = useState(0);
  const [costIndex, setCostIndex] = useState(1);
  const [testResult, setTestResult] = useState("");
  const [error, setError] = useState("");

  const selectedProvider = PROVIDER_OPTIONS[providerIndex]?.value ?? "openrouter";
  const models = useMemo(() => MODEL_OPTIONS[selectedProvider], [selectedProvider]);

  const runTest = useCallback(async () => {
    setStep("testing");
    setError("");

    const chosenModel = models[modelIndex]?.value ?? models[0]?.value ?? "anthropic/claude-sonnet-4-6";
    const chosenCost = COST_OPTIONS[costIndex]?.value ?? "balanced";

    const settings: Settings = {
      provider: selectedProvider,
      apiKey: apiKey.trim() || undefined,
      openAICompatBaseUrl: baseUrl.trim() || "http://localhost:4000/v1",
      defaultModel: chosenModel,
      models: {
        fast: models[Math.min(models.length - 1, 2)]?.value ?? chosenModel,
        balanced: models[Math.min(models.length - 1, 1)]?.value ?? chosenModel,
        powerful: models[0]?.value ?? chosenModel,
      },
      costMode: chosenCost,
      maxTokenBudget: null,
      autoCompactAt: 0.85,
      permissions: {
        mode: "normal",
        customRules: [],
      },
      mcpServers: {},
    };

    try {
      const provider = createProvider(settings);
      const response = await provider.createMessage({
        model: chosenModel,
        messages: [{ role: "user", content: "Reply with exactly: setup ok" }],
        maxTokens: 32,
      });

      setTestResult(response.content || "setup ok");
      const persisted = saveSettings(settings);
      setStep("done");
      setTimeout(() => onComplete(persisted), 1200);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStep(selectedProvider === "openai-compat" ? "model" : "apikey");
    }
  }, [apiKey, baseUrl, costIndex, modelIndex, models, onComplete, selectedProvider]);

  useInput((input, key) => {
    if (key.escape) {
      exit();
      return;
    }

    switch (step) {
      case "welcome":
        if (key.return) {
          setStep("provider");
        }
        break;
      case "provider":
        if (key.upArrow) {
          setProviderIndex((value) => Math.max(0, value - 1));
        }
        if (key.downArrow) {
          setProviderIndex((value) => Math.min(PROVIDER_OPTIONS.length - 1, value + 1));
        }
        if (key.return) {
          setApiKey("");
          setModelIndex(0);
          setStep("apikey");
        }
        break;
      case "apikey": {
        const keyRequired = selectedProvider !== "openai-compat";
        if (key.return && (!keyRequired || apiKey.trim().length > 0)) {
          setStep("model");
          return;
        }

        if (key.backspace || key.delete) {
          if (selectedProvider === "openai-compat") {
            setBaseUrl((value) => value.slice(0, -1));
          } else {
            setApiKey((value) => value.slice(0, -1));
          }
          return;
        }

        if (input && !key.ctrl && !key.meta && input.length === 1) {
          if (selectedProvider === "openai-compat") {
            setBaseUrl((value) => value + input);
          } else {
            setApiKey((value) => value + input);
          }
        }
        break;
      }
      case "model":
        if (key.upArrow) {
          setModelIndex((value) => Math.max(0, value - 1));
        }
        if (key.downArrow) {
          setModelIndex((value) => Math.min(models.length - 1, value + 1));
        }
        if (key.return) {
          setStep("cost");
        }
        break;
      case "cost":
        if (key.upArrow) {
          setCostIndex((value) => Math.max(0, value - 1));
        }
        if (key.downArrow) {
          setCostIndex((value) => Math.min(COST_OPTIONS.length - 1, value + 1));
        }
        if (key.return) {
          void runTest();
        }
        break;
      case "testing":
      case "done":
        break;
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      {step === "welcome" && (
        <Box flexDirection="column">
          <Text color="cyan" bold>
            Welcome to BombaCode
          </Text>
          <Text>
            BombaCode is a terminal coding agent. This setup will configure your default provider and model.
          </Text>
          <Text dimColor>{"\n"}Press Enter to continue, Esc to exit.</Text>
        </Box>
      )}

      {step === "provider" && (
        <Box flexDirection="column">
          <Text bold>Select your provider</Text>
          <Text>{""}</Text>
          {PROVIDER_OPTIONS.map((option, index) => (
            <Box key={option.value}>
              <Text color={index === providerIndex ? "cyan" : undefined}>
                {index === providerIndex ? ">" : " "} {option.label}
              </Text>
              <Text dimColor> - {option.desc}</Text>
            </Box>
          ))}
          <Text dimColor>{"\n"}Use arrows and Enter.</Text>
        </Box>
      )}

      {step === "apikey" && (
        <Box flexDirection="column">
          {selectedProvider === "openai-compat" ? (
            <>
              <Text bold>Enter LiteLLM/OpenAI-compatible base URL</Text>
              <Text>{"\n"}URL: {baseUrl}</Text>
              <Text dimColor>{"\n"}Default: http://localhost:4000/v1</Text>
            </>
          ) : (
            <>
              <Text bold>
                Enter your {selectedProvider === "openrouter" ? "OpenRouter" : "Anthropic"} API key
              </Text>
              <Text>{"\n"}Key: {"•".repeat(Math.min(apiKey.length, 48))}</Text>
            </>
          )}
          {error ? <Text color="red">{"\n"}Error: {error}</Text> : null}
          <Text dimColor>{"\n"}Press Enter to continue.</Text>
        </Box>
      )}

      {step === "model" && (
        <Box flexDirection="column">
          <Text bold>Select your default model</Text>
          <Text>{""}</Text>
          {models.map((option, index) => (
            <Text key={option.value} color={index === modelIndex ? "cyan" : undefined}>
              {index === modelIndex ? ">" : " "} {option.label}
            </Text>
          ))}
          {error ? <Text color="red">{"\n"}Error: {error}</Text> : null}
          <Text dimColor>{"\n"}Use arrows and Enter.</Text>
        </Box>
      )}

      {step === "cost" && (
        <Box flexDirection="column">
          <Text bold>Select cost preference</Text>
          <Text>{""}</Text>
          {COST_OPTIONS.map((option, index) => (
            <Box key={option.value}>
              <Text color={index === costIndex ? "cyan" : undefined}>
                {index === costIndex ? ">" : " "} {option.label}
              </Text>
              <Text dimColor> - {option.description}</Text>
            </Box>
          ))}
          <Text dimColor>{"\n"}Use arrows and Enter to run API test.</Text>
        </Box>
      )}

      {step === "testing" && (
        <Box flexDirection="column">
          <Text color="yellow">Testing API connection...</Text>
        </Box>
      )}

      {step === "done" && (
        <Box flexDirection="column">
          <Text color="green" bold>
            Setup complete
          </Text>
          <Text>Test response: {testResult}</Text>
          <Text dimColor>{"\n"}Launching BombaCode...</Text>
        </Box>
      )}
    </Box>
  );
};
