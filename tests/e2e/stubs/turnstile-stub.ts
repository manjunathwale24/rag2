import { createServer, type Server } from "node:http";
import { readBody, sendJson } from "./http";

export const TURNSTILE_STUB_PORT = 4012;
export const E2E_CAPTCHA_TOKEN = "e2e-token";
export const E2E_TURNSTILE_SECRET = "e2e-turnstile-secret";

// Replaces the Turnstile widget script: the "widget" solves itself immediately with the E2E token.
const WIDGET_SCRIPT = `
window.turnstile = {
  render: function (container, options) {
    options.callback(${JSON.stringify(E2E_CAPTCHA_TOKEN)});
    return "e2e-widget";
  },
  remove: function () {},
};
`;

export function startTurnstileStub(port = TURNSTILE_STUB_PORT): Promise<Server> {
  const server = createServer(async (req, res) => {
    const url = req.url ?? "/";

    if (req.method === "GET" && url === "/health") return sendJson(res, 200, { ok: true });

    if (req.method === "GET" && url === "/api.js") {
      res.writeHead(200, { "content-type": "text/javascript" });
      return res.end(WIDGET_SCRIPT);
    }

    if (req.method === "POST" && url === "/siteverify") {
      const form = new URLSearchParams((await readBody(req)).toString("utf8"));
      const success = form.get("secret") === E2E_TURNSTILE_SECRET && form.get("response") === E2E_CAPTCHA_TOKEN;
      return sendJson(res, 200, { success });
    }

    sendJson(res, 404, { error: `no stub route for ${req.method} ${url}` });
  });

  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}
