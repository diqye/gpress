import { describe, test, expect } from "bun:test"
import { G } from "../src/Gpress"

describe("G.path", () => {
  test("matches exact path", async () => {
    const handler = G.path("api")
    const req = new Request("http://localhost/api")
    const result = await handler.run(req)
    expect(result.cos).toBe("final")
  })

  test("matches exact mutiple path", async () => {
    const handler = G.path("/api/1/2/3")
    const req = new Request("http://localhost/api/1/2/3")
    const result = await handler.run(req)
    expect(result.cos).toBe("final")
  })

  test("continues on mismatch", async () => {
    const handler = G.path("api")
    const req = new Request("http://localhost/other")
    const result = await handler.run(req)
    expect(result.cos).toBe("continue")
  })
})

describe("G.pathOne", () => {
  test("captures one path segment", async () => {
    const handler = G.path("user").pathOne()
    const req = new Request("http://localhost/user/123")
    const result = await handler.run(req)
    expect(result.cos).toBe("final")
    if (result.cos === "final") {
      expect(result.final).toBe("123")
    }
  })

  test("continues when no path left", async () => {
    const handler = G.path("user").pathOne()
    const req = new Request("http://localhost/user")
    const result = await handler.run(req)
    expect(result.cos).toBe("continue")
  })
})

describe("G.get/post/put/patch/delete", () => {
  test("get matches GET method", async () => {
    const handler = G.path("api").get()
    const req = new Request("http://localhost/api", { method: "GET" })
    const result = await handler.run(req)
    expect(result.cos).toBe("final")
  })

  test("post matches POST method", async () => {
    const handler = G.path("api").post()
    const req = new Request("http://localhost/api", { method: "POST" })
    const result = await handler.run(req)
    expect(result.cos).toBe("final")
  })

  test("continues on method mismatch", async () => {
    const handler = G.path("api").get()
    const req = new Request("http://localhost/api", { method: "POST" })
    const result = await handler.run(req)
    expect(result.cos).toBe("continue")
  })
})

describe("G.request", () => {
  test("returns Request object", async () => {
    const handler = G.path("api").request()
    const req = new Request("http://localhost/api")
    const result = await handler.run(req)
    expect(result.cos).toBe("final")
    if (result.cos === "final") {
      expect(result.final).toBeInstanceOf(Request)
    }
  })
})

describe("G.requestJson", () => {
  test("parses JSON body", async () => {
    const handler = G.path("api").post().requestJson()
    const req = new Request("http://localhost/api", {
      method: "POST",
      body: JSON.stringify({ name: "test" }),
    })
    const result = await handler.run(req)
    expect(result.cos).toBe("final")
    if (result.cos === "final") {
      const json = result.final as unknown
      expect(json).toEqual({ name: "test" })
    }
  })

  test("returns 400 on invalid JSON", async () => {
    const handler = G.path("api").post().requestJson()
    const req = new Request("http://localhost/api", {
      method: "POST",
      body: "not json",
    })
    const result = await handler.run(req)
    expect(result.cos).toBe("end")
    if (result.cos === "end") {
      expect(result.response.status).toBe(400)
    }
  })
})

describe("G.pureJson / G.endJson", () => {
  test("pureJson returns final with Response", async () => {
    const handler = G.pureJson({ ok: true })
    const req = new Request("http://localhost")
    const result = await handler.run(req)
    expect(result.cos).toBe("final")
    if (result.cos === "final") {
      expect(result.final).toBeInstanceOf(Response)
    }
  })

  test("endJson returns end with Response", async () => {
    const handler = G.endJson({ error: "not found" }, { status: 404 })
    const req = new Request("http://localhost")
    const result = await handler.run(req)
    expect(result.cos).toBe("end")
    if (result.cos === "end") {
      expect(result.response.status).toBe(404)
    }
  })
})

describe("G.bind", () => {
  test("transforms value", async () => {
    const handler = G.path("api")
      .pathOne()
      .bind((id) => G.pureJson({ id: id }))

    const req = new Request("http://localhost/api/123")
    const result = await handler.run(req)
    expect(result.cos).toBe("final")
    if (result.cos === "final") {
      const json = await (result.final as Response).json()
      expect(json).toEqual({ id: "123" })
    }
  })

  test("supports async", async () => {
    const handler = G.path("api")
      .pathOne()
      .bind(async (id) => {
        await new Promise(r => setTimeout(r, 10))
        return G.pureJson({ id })
      })

    const req = new Request("http://localhost/api/123")
    const result = await handler.run(req)
    expect(result.cos).toBe("final")
  })
})

describe("G.alt", () => {
  test("tries first, falls back to second", async () => {
    const handler = G.path("a").get().bind(() => G.pureJson({ a: 1 }))
      .alt(G.path("b").get().bind(() => G.pureJson({ b: 2 })))

    const reqA = new Request("http://localhost/a", { method: "GET" })
    const resA = await handler.runWith404(reqA)
    expect("status" in resA ? resA.status : 200).toBe(200)

    const reqB = new Request("http://localhost/b", { method: "GET" })
    const resB = await handler.runWith404(reqB)
    expect("status" in resB ? resB.status : 200).toBe(200)
  })
})

describe("G.nullPath", () => {
  test("matches empty path", async () => {
    const handler = G.path("api").nullPath()
    const req = new Request("http://localhost/api")
    const result = await handler.run(req)
    expect(result.cos).toBe("final")
  })

  test("continues when path not empty", async () => {
    const handler = G.path("api").nullPath()
    const req = new Request("http://localhost/api/other")
    const result = await handler.run(req)
    expect(result.cos).toBe("continue")
  })
})

describe("G.headers", () => {
  test("returns Headers object", async () => {
    const handler = G.path("api").headers()
    const req = new Request("http://localhost/api", {
      headers: { "Content-Type": "application/json" },
    })
    const result = await handler.run(req)
    expect(result.cos).toBe("final")
    if (result.cos === "final") {
      expect(result.final.get("content-type")).toBe("application/json")
    }
  })
})

describe("runWith404", () => {
  test("returns 404 on continue", async () => {
    const handler = G.path("api").get()
    const req = new Request("http://localhost/other")
    const res = await handler.runWith404(req)
    expect("status" in res ? res.status : 404).toBe(404)
  })

  test("returns response on end", async () => {
    const handler = G.path("api").get().bind(() => G.endJson({ ok: true }))
    const req = new Request("http://localhost/api")
    const res = await handler.runWith404(req)
    expect("status" in res ? res.status : 404).toBe(200)
  })
})
