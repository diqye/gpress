import { describe, test, expect } from "bun:test"
import { G } from "../src/Gpress"

describe("G.exactPath / G.ePath", () => {
  test("exact match with no params", async () => {
    const handler = G.ePath("/api/user")
    const req = new Request("http://localhost/api/user")
    const result = await handler.run(req)
    expect(result.cos).toBe("final")
    if (result.cos === "final") {
      expect(result.final).toEqual({})
    }
  })

  test("extracts named params", async () => {
    const handler = G.ePath("/api/user/:id")
    const req = new Request("http://localhost/api/user/123")
    const result = await handler.run(req)
    expect(result.cos).toBe("final")
    if (result.cos === "final") {
      expect(result.final).toEqual({ id: "123" })
    }
  })

  test("extracts multiple named params", async () => {
    const handler = G.ePath("/api/user/:id/:scope/xx")
    const req = new Request("http://localhost/api/user/42/admin/xx")
    const result = await handler.run(req)
    expect(result.cos).toBe("final")
    if (result.cos === "final") {
      expect(result.final).toEqual({ id: "42", scope: "admin" })
    }
  })

  test("continues on extra path segments", async () => {
    const handler = G.ePath("/api/user/:id")
    const req = new Request("http://localhost/api/user/123/extra")
    const result = await handler.run(req)
    expect(result.cos).toBe("continue")
  })

  test("continues on missing path segments", async () => {
    const handler = G.ePath("/api/user/:id")
    const req = new Request("http://localhost/api/user")
    const result = await handler.run(req)
    expect(result.cos).toBe("continue")
  })

  test("continues on literal mismatch", async () => {
    const handler = G.ePath("/api/user/:id/xx")
    const req = new Request("http://localhost/api/user/123/yy")
    const result = await handler.run(req)
    expect(result.cos).toBe("continue")
  })

  test("decodes URI-encoded params", async () => {
    const handler = G.ePath("/api/user/:name")
    const req = new Request("http://localhost/api/user/hello%20world")
    const result = await handler.run(req)
    expect(result.cos).toBe("final")
    if (result.cos === "final") {
      expect(result.final).toEqual({ name: "hello world" })
    }
  })

  test("malformed percent sequence in param returns raw string, not throw", async () => {
    const handler = G.ePath("/api/user/:name")
    const req = new Request("http://localhost/api/user/%E9")
    const result = await handler.run(req)
    expect(result.cos).toBe("final")
    if (result.cos === "final") {
      expect(result.final).toEqual({ name: "%E9" })
    }
  })

  test("malformed percent sequence in rest keeps raw string", async () => {
    const handler = G.exactPath("/files/*rest")
    const req = new Request("http://localhost/files/a/%E9/b")
    const result = await handler.run(req)
    expect(result.cos).toBe("final")
    if (result.cos === "final") {
      expect(result.final).toEqual({ rest: "a/%E9/b" })
    }
  })

  test("restnames is empty on exact match", async () => {
    const handler = G.ePath("/api/user/:id")
    const req = new Request("http://localhost/api/user/123")
    const result = await handler.run(req)
    expect(result.cos).toBe("final")
    if (result.cos === "final") {
      expect(result.restnames).toEqual([])
    }
  })

  test("composes with method matching", async () => {
    const handler = G.get().ePath("/api/user/:id")
    const req = new Request("http://localhost/api/user/123", { method: "GET" })
    const result = await handler.run(req)
    expect(result.cos).toBe("final")
    if (result.cos === "final") {
      expect(result.final).toEqual({ id: "123" })
    }
  })

  test("composes with ePath as instance method", async () => {
    const handler = G.path("/api").ePath("user/:id")
    const req = new Request("http://localhost/api/user/123")
    const result = await handler.run(req)
    expect(result.cos).toBe("final")
    if (result.cos === "final") {
      expect(result.final).toEqual({ id: "123" })
    }
  })

  test("supports rest wildcard as last segment", async () => {
    const handler = G.exactPath("/files/*rest")
    const req = new Request("http://localhost/files/xxxx/xxx/x")
    const result = await handler.run(req)
    expect(result.cos).toBe("final")
    if (result.cos === "final") {
      expect(result.final).toEqual({ rest: "xxxx/xxx/x" })
      expect(result.restnames).toEqual([])
    }
  })

  test("supports empty rest wildcard", async () => {
    const handler = G.exactPath("/files/*rest")
    const req = new Request("http://localhost/files")
    const result = await handler.run(req)
    expect(result.cos).toBe("final")
    if (result.cos === "final") {
      expect(result.final).toEqual({ rest: "" })
    }
  })

  test("exactPath aliases old ePath behavior", async () => {
    const handler = G.exactPath("/api/user/:id")
    const req = new Request("http://localhost/api/user/123")
    const result = await handler.run(req)
    expect(result.cos).toBe("final")
    if (result.cos === "final") {
      expect(result.final).toEqual({ id: "123" })
    }
  })
})

describe("G.onFinal", () => {
  test("can modify responseHeaders", async () => {
    const handler = G.path("/api").get()
      .map(() => Response.json({ ok: true }))
      .onFinal(final => ({
        ...final,
        responseHeaders: { ...final.responseHeaders, "X-Custom": "test" }
      }))

    const req = new Request("http://localhost/api", { method: "GET" })
    const result = await handler.run(req)
    expect(result.cos).toBe("final")
    expect(result.responseHeaders["X-Custom"]).toBe("test")
  })

  test("can change end to continue (short-circuit override)", async () => {
    const handler = G.endJson({ error: "fail" }, { status: 500 })
      .onFinal(final => {
        if (final.cos === "end" && final.response.status >= 500) {
          return {
            cos: "end" as const,
            response: Response.json({ error: "internal server error" }, { status: 500 }),
            responseHeaders: final.responseHeaders,
            userData: final.userData
          }
        }
        return final
      })

    const req = new Request("http://localhost")
    const result = await handler.run(req)
    expect(result.cos).toBe("end")
    if (result.cos === "end") {
      const body = await result.response.json()
      expect(body).toEqual({ error: "internal server error" })
    }
  })

  test("passes through when no modification", async () => {
    const handler = G.path("/api").get()
      .onFinal(final => final)

    const req = new Request("http://localhost/api", { method: "GET" })
    const result = await handler.run(req)
    expect(result.cos).toBe("final")
  })

  test("can add CORS headers as middleware", async () => {
    const withCors = <A>(g: G<A>): G<A> => g.onFinal(final => ({
      ...final,
      responseHeaders: { ...final.responseHeaders, "Access-Control-Allow-Origin": "*" }
    }))

    const handler = withCors(
      G.path("/api").get().map(() => Response.json({ data: 1 }))
    )

    const req = new Request("http://localhost/api", { method: "GET" })
    const result = await handler.run(req)
    expect(result.responseHeaders["Access-Control-Allow-Origin"]).toBe("*")
  })

  test("onFinal with semiBindTap (before + after middleware)", async () => {
    const logs: string[] = []

    const auth = G.fromHandler((req, ctx) => {
      logs.push("auth")
      return {
        cos: "final" as const,
        final: void 0,
        restnames: ctx.pathnames,
        responseHeaders: ctx.responseHeaders,
        userData: ctx.userData
      }
    })

    const handler = auth
      .semiBindTap(G.path("/api").get().map(() => Response.json({ ok: true })))
      .onFinal(final => {
        logs.push("after")
        return final
      })

    const req = new Request("http://localhost/api", { method: "GET" })
    await handler.run(req)
    expect(logs).toEqual(["auth", "after"])
  })
})
