import { describe, test, expect } from "bun:test"
import { G } from "../src/Gpress"

describe("hello world", () => {
  test("basic route", async () => {
    const handler = G.path("/hello/world")
      .get()
      .bind(() => G.pureJson({ message: "hello world" }))

    const req = new Request("http://localhost/hello/world")
    const res = await handler.runWith404(req)
    const json = await res.json()

    expect(json).toEqual({ message: "hello world" })
  })

  test("path params", async () => {
    const handler = G.path("user")
      .get()
      .pathOne()
      .bind((id) => G.pureJson({ id }))

    const req = new Request("http://localhost/user/123")
    const res = await handler.runWith404(req)
    const json = await res.json()

    expect(json).toEqual({ id: "123" })
  })

  test("404 not found", async () => {
    const handler = G.path("hello").get().semiBind(G.pureText(""))

    const req = new Request("http://localhost/other")
    const res = await handler.runWith404(req)

    expect(res.status).toBe(404)
  })
})
