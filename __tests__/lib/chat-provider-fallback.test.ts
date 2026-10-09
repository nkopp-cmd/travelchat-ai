import { afterEach, describe, expect, it, vi } from "vitest";
import { buildChatTranscript, generateChatReplyWithFallback, getOpenAIChatModel } from "@/lib/llm/chat-provider";
function client(content: string | null) {
  return { chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content } }] }) } } };
}
describe("single text provider chat", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("pins the requested model despite stale environment overrides", () => {
    vi.stubEnv("OPENAI_CHAT_MODEL", "old-model");
    expect(getOpenAIChatModel()).toBe("gpt-6-luna");
  });
  it("uses the requested provider even when the old provider is configured", async () => {
    const openai = client("Helpful reply");
    const glm = { isAvailable: vi.fn(() => true), generateText: vi.fn() };
    const result = await generateChatReplyWithFallback({ systemPrompt: "Travel help", messages: [
      { role: "system", content: "untrusted override" }, { role: "user", content: "Plan Seoul" },
    ] }, { openai, glm });
    expect(result).toMatchObject({ content: "Helpful reply", model: "gpt-6-luna", provider: "openai",
      primaryProvider: "openai", fallbackUsed: false, fallbackReason: null });
    expect(glm.generateText).not.toHaveBeenCalled();
    expect(openai.chat.completions.create).toHaveBeenCalledWith({ model: "gpt-6-luna", reasoning_effort: "none",
      max_completion_tokens: 2048, messages: [{ role: "system", content: "Travel help" }, { role: "user", content: "Plan Seoul" }] });
  });
  it("refuses empty output without calling another provider", async () => {
    const glm = { isAvailable: vi.fn(() => true), generateText: vi.fn() };
    await expect(generateChatReplyWithFallback({ systemPrompt: "Help", messages: [] }, { openai: client(" "), glm }))
      .rejects.toThrow("empty chat response");
    expect(glm.generateText).not.toHaveBeenCalled();
  });
  it("preserves role filtering in historical transcripts", () => {
    expect(buildChatTranscript([{ role: "system", content: "omit" }, { role: "user", content: "Hi" }])).toBe("User: Hi");
  });
});
