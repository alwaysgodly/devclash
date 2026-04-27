// Thin wrapper around the locally-authenticated `gemini` CLI
// (Google's Gemini CLI: https://github.com/google-gemini/gemini-cli).
// Production would swap this for a direct Gemini API call with an API key.
const { spawn } = require("child_process");

function runGemini(prompt, { timeoutMs = 45_000 } = {}) {
  return new Promise((resolve, reject) => {
    // Pass through GEMINI_API_KEY / GOOGLE_API_KEY if set; otherwise the CLI
    // falls back to its cached OAuth credentials from the first `gemini` login.
    // stdio: 'ignore' on stdin silences the interactive-mode prompt.
    const proc = spawn("gemini", ["-p", prompt], {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`gemini cli timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout.on("data", (d) => {
      out += d.toString();
    });
    proc.stderr.on("data", (d) => {
      err += d.toString();
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`gemini cli exit ${code}: stderr=${err.trim() || "<empty>"} stdout=${out.trim() || "<empty>"}`));
    });
    proc.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

module.exports = { runGemini };
