import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import process from "node:process"

function previewApi() {
  return {
    name: "skydrive-preview-api",
    async configureServer(server) {
      const { handle, clients } = await import("./preview/engine.mjs")
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || ""
        if (!url.startsWith("/__api")) return next()

        if (url.startsWith("/__api/events")) {
          res.statusCode = 200
          res.setHeader("Content-Type", "text/event-stream")
          res.setHeader("Cache-Control", "no-cache")
          res.setHeader("Connection", "keep-alive")
          res.flushHeaders?.()
          res.write(":\n\n")
          clients.add(res)
          req.on("close", () => clients.delete(res))
          return
        }

        const cmd = decodeURIComponent(url.replace("/__api/", "").split("?")[0])
        const chunks = []
        for await (const c of req) chunks.push(c)
        let args = {}
        try {
          const raw = Buffer.concat(chunks).toString("utf8")
          if (raw) args = JSON.parse(raw)
        } catch {
          args = {}
        }
        try {
          const result = await handle(cmd, args)
          res.statusCode = 200
          res.setHeader("Content-Type", "application/json")
          res.end(JSON.stringify(result ?? null))
        } catch (e) {
          res.statusCode = 400
          res.setHeader("Content-Type", "text/plain; charset=utf-8")
          res.end(e instanceof Error ? e.message : String(e))
        }
      })
    },
  }
}

const host = process.env.TAURI_DEV_HOST

export default defineConfig(() => ({
  plugins: [react(), previewApi()],
  clearScreen: false,
  server: {
    port: 43123,
    strictPort: true,
    host: host || true,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 43124,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}))
