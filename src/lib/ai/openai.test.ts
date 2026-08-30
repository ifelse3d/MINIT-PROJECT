// ---------------------------------------------------------------------------
// Pins the OpenAI Responses API request SHAPES — the exact bug behind the
// 2026-08-30 home-door incident (fingerprint a53557e2c89a6e2d): every file was
// wrapped as `input_image`, and a PDF wrapped that way gets a 400 before any
// model runs. A PDF must ride as `input_file`; a real image stays
// `input_image`. No network here: postVendorJson is mocked.
// ---------------------------------------------------------------------------
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const postVendorJson = vi.fn();
vi.mock("./http", async (importOriginal) => {
  const real = await importOriginal<typeof import("./http")>();
  return { ...real, postVendorJson: (...args: unknown[]) => postVendorJson(...args) };
});

import { createOpenAiProvider } from "./openai";

type Content = { type: string; [k: string]: unknown };

function sentContent(): Content[] {
  const body = postVendorJson.mock.calls[0][0].body as {
    input: { role: string; content: Content[] }[];
  };
  return body.input[0].content;
}

const okReply = {
  status: "completed",
  output: [{ type: "message", content: [{ type: "output_text", text: '{"ok":true}' }] }],
  usage: { input_tokens: 10, output_tokens: 5 },
};

describe("createOpenAiProvider request shapes", () => {
  beforeEach(() => {
    postVendorJson.mockReset();
    postVendorJson.mockResolvedValue(okReply);
    process.env.OPENAI_API_KEY = "test-key";
  });

  it("wraps an image as input_image with a data URL", async () => {
    const provider = createOpenAiProvider("gpt-5-nano");
    await provider.extractJson({
      prompt: "what is this?",
      imageBase64: "aGVsbG8=",
      mimeType: "image/jpeg",
    });
    const content = sentContent();
    expect(content[0]).toEqual({ type: "input_text", text: "what is this?" });
    expect(content[1]).toMatchObject({
      type: "input_image",
      image_url: "data:image/jpeg;base64,aGVsbG8=",
    });
    expect(content[1]).toHaveProperty("detail");
  });

  it("wraps a PDF as input_file, never input_image", async () => {
    const provider = createOpenAiProvider("gpt-5-nano");
    await provider.extractJson({
      prompt: "what is this?",
      imageBase64: "cGRm",
      mimeType: "application/pdf",
    });
    const content = sentContent();
    expect(content[1]).toEqual({
      type: "input_file",
      filename: "dokumen.pdf",
      file_data: "data:application/pdf;base64,cGRm",
    });
    expect(content.some((c) => c.type === "input_image")).toBe(false);
  });

  it("sends text only when there is no file", async () => {
    const provider = createOpenAiProvider("gpt-5-nano");
    await provider.extractJson({ prompt: "text only" });
    expect(sentContent()).toEqual([{ type: "input_text", text: "text only" }]);
  });
});
