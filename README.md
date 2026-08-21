# gpress

路由解析器组合子 —— 把路由当作可组合的值，而不是配置声明。

## usage
```ts
export const api: G<Response> = G.path("/api").semiBind(G.alts(
  G.path("/course").semiBind(staticApi(COURSEWARE_ROOT)),
  G.ePath("/version").get().bind(version),

  // /logs:Basic auth(halfpencil),独立凭据
  G.path("/logs").semiBind(logsGuard(() => G.alts(
    G.ePath("/http").get().bind(logsHttp),
    G.ePath("/app").get().bind(logsApp),
  ))),

  // /x:cookie auth(jx_token),全部业务路由收在这一前缀,auth 只写一次
  G.path("/x").semiBind(authed((token) => G.alts(
    G.ePath("/courseware/:id").get().bind(readCourseware),
    G.ePath("/courseware/:id").put().bind(writeCourseware),
    G.ePath("/courseware/:id/tts").post().bind(ttsNode),
    G.ePath("/courseware/:id/tts-batch").post().bind(startTtsBatch),
    G.ePath("/courseware/:id/tts-batch").get().bind(ttsBatchProgress),
    G.ePath("/courseware/:id/output").get().bind(listOutputFiles),
    G.ePath("/courseware/:id/publish").post().bind(startPublish(token)),
    G.ePath("/courseware/:id/publish/status").get().bind(publishStatus),
    G.ePath("/import/:id/detail").get().bind(importDetail(token)),
    G.ePath("/import/:id/extract").post().bind(importExtract(token)),
    G.ePath("/audio-notes").get().bind(readAudioNotes),
    G.ePath("/audio-notes").put().bind(writeAudioNotes),
    G.ePath("/models").get().bind(models),
  ))),
));

const authed = (make: (token: string) => G<Response>): G<Response> =>
  G.request().bind((request) => {
    const token = new Bun.CookieMap(request.headers.get("cookie") ?? "").get("token");
    return token ? make(token) : G.endJson({ error: "未登录" }, { status: 401 });
});
serve({
  routes: {
    // gpress API
    "/api/*": (req, server) => api.runWith404(req,server),

  },


  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});
```

## 核心思想

传统路由库是**声明式配置**：

```ts
router.get("/user/:id", handler)
router.post("/user", handler)
```

路由是注册在 router 上的副作用，不可组合、不可复用、不可测试。

gpress 是**组合式**的：路由是值，用函数组合子拼装。

```ts
const getUser = G.path("/user").pathOne().get().bind(async id => {
  const user = await db.findUser(id)
  return G.pureJson(user)
})
```

`getUser` 是一个值，可以复用、组合、测试，不需要 router 实例。

## 三状态模型

每个 `G<A>` 的执行结果有三种状态：

| 状态 | 含义 | 类比 |
|------|------|------|
| `final` | 成功，携带值 A | 正则匹配成功 |
| `continue` | 不匹配，回溯尝试下一条 | 正则回溯 |
| `end` | 响应已发送，终止链路 | 短路返回 |

`continue` 是 gpress 与中间件 `next()` 的关键区别。`next()` 只能"继续"，无法区分"我不匹配"和"我匹配但出错了"。`continue` 让 `alt` 具备真正的**回溯能力**。

## 路由匹配

### path — 前缀匹配

`path` 匹配路径前缀，剩余段传递给后续组合子。这是组合式路由的基础：逐段匹配，逐步提取。

```ts
G.path("/api").pathOne().get()
// GET /api/123  → 匹配 /api，pathOne 提取 "123"
// GET /api      → 匹配 /api，pathOne 不匹配，整体 continue
```

如果需要精确匹配，在末尾加 `.nullPath()`：

```ts
G.path("/api").nullPath()  // 只匹配 /api，不匹配 /api/xxx
```

### exactPath — 精确匹配 + 参数提取

`exactPath` 一步完成：精确匹配 + 命名参数提取。不需要 `nullPath()`，不需要手动组合 `pathOne()`。

```ts
G.exactPath("/api/user/:id/:scope/xx")
// GET /api/user/42/admin/xx  → { id: "42", scope: "admin" }
// GET /api/user/42/admin/yy  → continue（字面量 xx 不匹配）
// GET /api/user/42           → continue（段数不够）
// GET /api/user/42/admin/xx/extra → continue（多出段，精确匹配）
```

支持最后一段通配捕获：

```ts
G.exactPath("/files/*rest")
// GET /files/a/b/c → { rest: "a/b/c" }
// GET /files       → { rest: "" }
```

兼容说明：`ePath` 仍保留，作为 `exactPath` 的别名。

`path` 和 `exactPath` 的选择：

| 场景 | 用 |
|------|------|
| 需要逐步提取、逐步组合 | `path` + `pathOne` |
| 路径模式明确，一次提取参数 | `exactPath` |

### pathOne — 提取单段

```ts
G.path("/api").pathOne()          // 提取任意一段
G.path("/api").pathOne("user")    // 匹配字面量 "user"，或提取一段
```

### restpaths — 获取剩余路径

```ts
G.path("/files").restpaths()  // GET /files/a/b/c → ["a", "b", "c"]
```

### many — 重复匹配

```ts
G.pathOne().many()  // 匹配所有路径段 → string[]
```

## HTTP 方法

```ts
G.path("/api").get()
G.path("/api").post()
G.path("/api").put()
G.path("/api").patch()
G.path("/api").delete()
G.path("/api").head()
```

## 数据提取

```ts
.request()       // Request 对象
.requestJson()   // 解析 JSON body，解析失败自动返回 400
.headers()       // Headers 对象
.requestUrl()    // URL 对象
```

### Zod 验证

```ts
G.path("/api").post()
  .requestJson()
  .zodParse(z.object({ name: z.string(), age: z.number() }))
  // 类型自动推断为 { name: string; age: number }
```

## 组合子

### bind — 链式异步组合

```ts
G.path("/api").pathOne()
  .bind(async id => {
    const user = await db.findUser(id)
    return G.pureJson(user)
  })
```

### map — 值变换

```ts
G.pathOne().map(id => id.toUpperCase())
```

### alt — 路由回溯

```ts
const routes = getUserRoute
  .alt(createUserRoute)
  .alt(deleteUserRoute)
```

第一条 `continue` 就尝试下一条，`final` 或 `end` 则停止。

### optional — 可选匹配

```ts
G.pathOne().optional()  // 匹配失败返回 undefined 而不是 continue
```

### semiBindTap / semiBind / semiBindKey

```ts
.semiBindTap(g)   // 先跑 g，成功后丢弃 g 的值，保留原值
.semiBind(g)      // 丢弃原值，使用 g 的值
.semiBindKey("user", g)  // 将 g 的值合并到对象的 user 字段
```

## 中间件

gpress 没有独立的中间件概念。中间件就是 `G<A>`，用现有组合子实现。

### Before — semiBindTap

`semiBindTap` 先跑前置逻辑，成功则继续，`end` 则短路，`continue` 则回溯。

```ts
const auth = G.request().bind(req => {
  const token = req.headers.get("authorization")
  if (!token) return G.endJson({ error: "unauthorized" }, { status: 401 })
  return G.pure(verify(token))
})

// 使用：/api 开头，auth 通过后才走后续路由
G.path("/api").semiBindTap(auth).semiBind(
  G.exactPath("user/:id").bind(({ id }) => getUser(id))
  .alt(G.exactPath("order/:id").bind(({ id }) => getOrder(id)))
  .alt(G.exactPath("product/:id").bind(({ id }) => getProduct(id)))
)
```

### After — onFinal

`onFinal` 拦截最终结果，可以修改 `responseHeaders`、替换 `response`、记录日志等。

```ts
// CORS
const withCors = <A>(g: G<A>): G<A> => g.onFinal(final => ({
  ...final,
  responseHeaders: { ...final.responseHeaders, "Access-Control-Allow-Origin": "*" }
}))

// 响应日志
const withLog = <A>(g: G<A>): G<A> => g.onFinal(final => {
  if (final.cos === "end") console.log(`response: ${final.response.status}`)
  return final
})

// 统一错误格式
const withErrorHandler = <A>(g: G<A>): G<A> => g.onFinal(final => {
  if (final.cos === "end" && final.response.status >= 500) {
    return { ...final, response: Response.json({ error: "internal" }, { status: 500 }) }
  }
  return final
})
```

组合使用：

```ts
auth
  .semiBindTap(apiRoutes)
  .onFinal(withCors)
  .onFinal(withLog)
```

### 为什么不用回调式中间件

gpress 的组合子就是中间件。`semiBindTap` 是 before，`onFinal` 是 after，`alt` 是 fallback。不需要 `app.use()`，不需要中间件栈，不需要 `next()`。每一步都是类型安全的组合。

## 响应构造

```ts
G.pureJson(obj, init?)    // 成功，返回 JSON 响应
G.pureText(text, init?)   // 成功，返回文本响应
G.end(response)           // 直接终止，返回 Response
G.endJson(obj, init?)     // 直接终止，返回 JSON Response
```

## 运行

```ts
// 返回 Final<A>，自行处理
const result = await route.run(request)

// 自动处理：continue → 404，end/final → Response
const response = await route.runWith404(request)
```

## 启动（Bun 全栈）

```ts
import { serve } from "bun"
import index from "./index.html"
import { api } from "./api"

const server = serve({
  routes: {
    "/": index,
  },
  port: 7799,
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
  fetch: req => api.runWith404(req),
})
```

routes 放静态资源，fetch 放后端接口。

## 静态资源服务

```ts
import { staticApi } from "gpress/static/bun/staticApi"

const staticFiles = staticApi("./public")

const api: G<Response> = G.path("/api")
  .semiBind(auth)
  .alt(staticFiles)
```

支持 GET/HEAD、多级路径、Range 请求（断点续传）、404/416 错误处理。

## userData 和 responseHeaders

`userData` 在组合子之间传递任意数据（如认证信息），`responseHeaders` 累积响应头，最终由 `runWith404` 写入 Response。

`userData` 类型为 `any`，这是务实选择。泛型化会导致每个组合子的类型签名爆炸，得不偿失。

## 依赖

- `zod` — Schema 验证

## 未来：文档生成与自动测试

核心观察：`bind` 内部的业务逻辑是黑盒，无法自动提取。但 `bind` 之前的结构化部分都可以收集为元数据。

| 组合子 | 可自动提取 |
|--------|-----------|
| `exactPath("/user/:id")` | path + params |
| `.get()` / `.post()` | method |
| `.requestJson()` | 需要 JSON body |
| `.zodParse(schema)` | 请求体 schema |
| `.bind(fn)` | 黑盒，需手动声明产出 |

方案：给 `G` 加 `meta` 字段，组合子自动积累元数据，`bind` 的产出用 `.responseSchema()` 手动声明。

```ts
// 用法
G.exactPath("/api/user/:id").get()
  .responseSchema(UserSchema)        // 声明 bind 的产出
  .bind(async ({ id }) => db.findUser(id))

// 文档生成
route.runDocs()
// → { method: "GET", path: "/api/user/:id", params: ["id"], response: UserSchema }

// alt 返回多条 meta
userRoutes.alt(orderRoutes).runDocs()
// → [{ method: "GET", path: "/api/user/:id", ... }, { ... }]
```

元数据结构：

```ts
interface RouteMeta {
  method?: string
  pathPattern?: string
  params?: string[]
  requestSchema?: z.ZodType
  responseSchema?: z.ZodType
  description?: string
}
```

每个组合子（path、get、zodParse 等）创建新 G 时合并 meta，`bind` 不添加 meta 但保留已有的。文档生成只依赖结构化部分，不依赖黑盒逻辑。
