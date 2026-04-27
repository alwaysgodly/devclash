// Provider-agnostic LLM CLI dispatcher. Picks between Gemini CLI and Claude CLI
// based on the LLM_PROVIDER env var (default: gemini).
const { runClaude, extractJson } = require("./claude");
const { runGemini } = require("./gemini");

const provider = (process.env.LLM_PROVIDER || "gemini").toLowerCase();

function runLLM(prompt, opts) {
  if (provider === "claude") return runClaude(prompt, opts);
  if (provider === "gemini") return runGemini(prompt, opts);
  return Promise.reject(
    new Error(`unknown LLM_PROVIDER "${provider}" — expected "gemini" or "claude"`)
  );
}

module.exports = { runLLM, extractJson, provider };
