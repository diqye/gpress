import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import * as p from "node:path"
import { staticApi } from "../src/static/bun/staticApi"

let serveDir: string

beforeAll(() => {
  serveDir = mkdtempSync(p.join(tmpdir(), "gpress-static-"))
  writeFileSync(p.join(serveDir, "doc.md"), "# 中文文档")
  writeFileSync(p.join(serveDir, "data.json"), "{\"a\":1}")
})

afterAll(() => {
  rmSync(serveDir, { recursive: true, force: true })
})

describe("staticApi", () => {
  test("markdown 200 appends charset=utf-8 to text/*", async () => {
    const res = await staticApi(serveDir).runWith404(new Request("http://x/doc.md"))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("text/markdown;charset=utf-8")
  })

  test("markdown 206 appends charset=utf-8", async () => {
    const res = await staticApi(serveDir).runWith404(
      new Request("http://x/doc.md", { headers: { range: "bytes=0-3" } })
    )
    expect(res.status).toBe(206)
    expect(res.headers.get("content-type")).toBe("text/markdown;charset=utf-8")
  })

  test("non-text type keeps Bun sniffed content-type as-is", async () => {
    const res = await staticApi(serveDir).runWith404(new Request("http://x/data.json"))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/json;charset=utf-8")
  })

  test("malformed percent sequence yields 404, not 500", async () => {
    const res = await staticApi(serveDir).runWith404(new Request("http://x/%E9"))
    expect(res.status).toBe(404)
  })
})
