// Thin wrapper around the locally-authenticated `claude` CLI.
// Production would swap this for an Anthropic SDK call with an API key.
const { spawn } = require("child_process");

function runClaude(prompt, { timeoutMs = 45_000 } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn("claude", ["-p", prompt], { shell: false });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`claude cli timed out after ${timeoutMs}ms`));
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
      else reject(new Error(`claude cli exit ${code}: ${err || out}`));
    });
    proc.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

function extractJson(raw) {
  let text = String(raw).trim();
  // Strip markdown code fences if the CLI wrapped the response.
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  // If there's leading/trailing prose, try to isolate the first JSON object.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  return JSON.parse(text);
}

module.exports = { runClaude, extractJson };
