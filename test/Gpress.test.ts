import { describe, test, expect } from "bun:test"
import { G, HttpError } from "../src/Gpress"

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

  test("malformed percent sequence returns raw string, not throw", async () => {
    const handler = G.path("user").pathOne()
    const req = new Request("http://localhost/user/%E9")
    const result = await handler.run(req)
    expect(result.cos).toBe("final")
    if (result.cos === "final") {
      expect(result.final).toBe("%E9")
    }
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
    const res = await handler.runWith404(req)
    if (!(res instanceof Response)) throw new Error("expected Response")
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ code: "INVALID_JSON", message: "JSON解析失败" })
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

describe("G.alts", () => {
  test("tries branches left to right", async () => {
    const handler = G.alts(
      G.path("a").get().bind(() => G.pureJson({ a: 1 })),
      G.path("b").get().bind(() => G.pureJson({ b: 2 })),
      G.path("c").get().bind(() => G.pureJson({ c: 3 })),
    )

    const resA = await handler.run(new Request("http://localhost/a", { method: "GET" }))
    expect(resA.cos).toBe("final")

    const resC = await handler.run(new Request("http://localhost/c", { method: "GET" }))
    expect(resC.cos).toBe("final")

    // 全不匹配
    const resD = await handler.run(new Request("http://localhost/d", { method: "GET" }))
    expect(resD.cos).toBe("continue")
  })

  test("empty args is continue (zero)", async () => {
    const handler = G.alts()
    const res = await handler.run(new Request("http://localhost/x"))
    expect(res.cos).toBe("continue")
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

describe("G.error", () => {
  test("constructs HttpError from object", () => {
    const e = G.error({ httpcode: 404, code: "DRAMA_NOT_FOUND", message: "短剧不存在" })
    expect(e).toBeInstanceOf(HttpError)
    expect(e).toBeInstanceOf(Error)
    expect(e.httpcode).toBe(404)
    expect(e.code).toBe("DRAMA_NOT_FOUND")
    expect(e.message).toBe("短剧不存在")
  })

  test("httpcode defaults to 500", () => {
    const e = G.error({ code: "ERR", message: "x" })
    expect(e.httpcode).toBe(500)
  })
})

describe("runWith404 错误边界", () => {
  test("throw G.error → 对应 httpcode + {code, message}", async () => {
    const handler = G.path("api").get().bind((): G<never> => {
      throw G.error({ httpcode: 404, code: "DRAMA_NOT_FOUND", message: "短剧不存在" })
    })
    const res = await handler.runWith404(new Request("http://localhost/api"))
    expect(res).toBeInstanceOf(Response)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ code: "DRAMA_NOT_FOUND", message: "短剧不存在" })
  })

  test("default httpcode is 500 at boundary", async () => {
    const handler = G.unit().bind((): G<never> => {
      throw G.error({ code: "ERR", message: "x" })
    })
    const res = await handler.runWith404(new Request("http://localhost/api"))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ code: "ERR", message: "x" })
  })

  test("deep plain async fn throw propagates to boundary", async () => {
    const compose = async (id: string) => {
      if (id === "x") throw G.error({ httpcode: 400, code: "NO_STORYBOARD", message: "还没有分镜表" })
      return { ok: true }
    }
    const handler = G.unit().bind(async () => G.pureJson(await compose("x")))
    const res = await handler.runWith404(new Request("http://localhost/api"))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ code: "NO_STORYBOARD", message: "还没有分镜表" })
  })

  test("throw aborts alt, no backtrack", async () => {
    const handler = G.unit()
      .bind((): G<never> => {
        throw G.error({ httpcode: 400, code: "ERR", message: "err" })
      })
      .alt(G.pureText("alt-branch"))
    const res = await handler.runWith404(new Request("http://localhost/api"))
    expect(res.status).toBe(400)
    expect(await res.text()).not.toBe("alt-branch")
  })

  test("sync throw → 500 {error: Internal Server Error}", async () => {
    const handler = G.unit().bind((): G<never> => {
      throw new Error("boom")
    })
    const res = await handler.runWith404(new Request("http://localhost/api"))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ code: "INTERNAL", message: "Internal Server Error" })
  })

  test("async throw → 500", async () => {
    const handler = G.unit().bind(async (): Promise<G<never>> => {
      throw new Error("boom")
    })
    const res = await handler.runWith404(new Request("http://localhost/api"))
    expect(res.status).toBe(500)
  })
})
