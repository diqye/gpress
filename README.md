# gpress

路由是可组合的值，不是注册在 router 上的配置。

```ts
const hello = G.ePath("/hello/:name").get()
  .bind(({ name }) => G.pureText(`hello, ${name}`))
```

`hello` 就是一个普通的值：可以放进变量、传给函数、直接单元测试、任意组合。没有 router 实例，没有副作用注册。

## 快速开始

```bash
bun add @diqye/gpress   # 未发布,先用 bun add github:diqye/gpress
```

```ts
import { G } from "@diqye/gpress"

const hello = G.ePath("/hello/:name").get()
  .bind(({ name }) => G.pureText(`hello, ${name}`))

Bun.serve({ fetch: (req) => hello.runWith404(req) })

// GET /hello/tom  → "hello, tom"
// GET /hello      → 404
```

只依赖 Web 标准 `Request` / `Response`,任何运行时都能跑(校验依赖 zod)。

## 核心思想

传统路由库是**声明式配置**：

```ts
router.get("/user/:id", handler)
router.post("/user", handler)
```

路由是注册在 router 上的副作用，不可组合、不可复用、不可测试。

gpress 是**组合式**的：路由是值，用组合子拼装。

```ts
const getUser = G.path("/user").pathOne().get().bind(async (id) => {
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

## 完整示例

分层组织：handler 是纯函数;guard(如 `authed`)是包装函数，只在组合树里以包装形态出现;路径 + method 集中在组合树一处。

```ts
// handler:统一为函数,树上全部 .bind(handler) 接入;
// 无参 handler 也可用惰性值 G.unit().bind(...) + semiBind 接入
const listUsers = (): G<Response> =>
  G.unit().bind(async () => G.pureJson({ users: await db.allUsers() }))

// guard:验 token,通过后把 auth 经闭包传入内部路由树,鉴权只写一次
const authed = (make: (auth: Auth) => G<Response>): G<Response> =>
  G.request().bind((req) => {
    const auth = verify(req)
    return auth ? make(auth) : G.endJson({ error: "未登录" }, { status: 401 })
  })

// 组合树:全部路由长在一棵树上
export const api: G<Response> = G.path("/api").semiBind(G.alts(
  // 公开路由
  G.ePath("/auth/login").post().bind(login),

  // 业务路由:auth 只写一次
  authed((auth) => G.alts(
    G.ePath("/auth/me").get().bind(() => G.pureJson(auth)),
    G.ePath("/users").get().bind(listUsers),
    G.ePath("/users").post().requestJson().zodParse(UserSchema).bind(createUser),
    G.ePath("/users/:name").delete().bind(({ name }) => removeUser(auth, name!)),
  )),
))
```

## API 速查

### 路径匹配

| 组合子 | 说明 |
|--------|------|
| `path(p)` | 前缀匹配，剩余段传给后续组合子 |
| `ePath(pattern)` | 精确匹配 + `:参数` 提取;`*rest` 通配尾段(`exactPath` 的别名) |
| `pathOne(name?)` | 提取单段;带 name 则匹配字面量 |
| `nullPath()` | 要求剩余路径为空(给 `path` 收尾) |
| `restpaths()` | 取剩余全部段 → `string[]` |

```ts
G.path("/api").pathOne().get()     // GET /api/123 → "123"
G.path("/api").nullPath()          // 只匹配 /api,不匹配 /api/xxx
G.ePath("/user/:id")               // /user/42 → { id: "42" },段数不符/字面量不符 → continue
G.ePath("/files/*rest")            // /files/a/b/c → { rest: "a/b/c" }
```

需要逐步提取、逐步组合用 `path` + `pathOne`;路径模式明确、一次提取参数用 `ePath`。

### HTTP 方法

```ts
G.path("/api").get()   // .post() .put() .patch() .delete() .head() 同理
```

### 数据提取

```ts
.request()        // Request 对象
.requestJson()    // JSON body,解析失败自动 400
.headers()        // Headers 对象
.requestUrl()     // URL 对象
.zodParse(schema) // Zod 校验,失败自动 400,成功后类型自动收窄
```

```ts
G.ePath("/user").post()
  .requestJson()
  .zodParse(z.object({ name: z.string(), age: z.number() }))
  .bind(async ({ name, age }) => G.pureJson(await createUser(name, age)))
  // 此处类型已推断为 { name: string; age: number }
```

### 组合子

| 组合子 | 作用 |
|--------|------|
| `bind(fn)` | 取出值接入业务逻辑，返回新的 G(一切业务逻辑都在这) |
| `map(fn)` | 值变换，不改变匹配状态 |
| `alt(g)` / `G.alts(...)` | 回溯：左侧 `continue` 尝试右侧,`final`/`end` 则停止 |
| `semiBind(g)` | 丢弃原值,接上 g |
| `semiBindTap(g)` | 先跑 g,成功后丢弃 g 的值,保留原值 |
| `semiBindKey("k", g)` | 将 g 的值挂到对象字段上 |
| `optional()` | 匹配失败返回 `undefined` 而非 `continue` |
| `many()` | 重复匹配至 `continue`,收集为数组(`G.pathOne().many()` 匹配所有段) |
| `onFinal(fn)` | 拦截最终结果,改 header / 替换响应 / 记日志 |

### 响应构造

```ts
G.pureJson(obj, init?)          // final:携带 JSON Response
G.pureText(text, init?)         // final:携带文本 Response
G.end(response)                 // end:直接终止,返回 Response
G.endJson(obj, init?)           // end:直接终止,返回 JSON Response
```

### 运行

```ts
const final   = await route.run(request)          // 返回 Final<A>,自行处理
const response = await route.runWith404(request)  // continue → 404,其余 → Response
```

## 中间件 = 组合子

gpress 没有独立的中间件概念，中间件就是 `G<A>`,用现有组合子实现：

**before 用 `semiBindTap`**——先跑前置逻辑,成功继续,`end` 短路,`continue` 回溯:

```ts
const auth = G.request().bind((req) => {
  const token = req.headers.get("authorization")
  return token ? G.pure(verify(token)) : G.endJson({ error: "unauthorized" }, { status: 401 })
})

G.path("/api").semiBindTap(auth).semiBind(userRoutes)
```

**after 用 `onFinal`**——拦截最终结果:

```ts
const withCors = <A>(g: G<A>): G<A> =>
  g.onFinal((final) => ({
    ...final,
    responseHeaders: { ...final.responseHeaders, "Access-Control-Allow-Origin": "*" },
  }))
```

不需要 `app.use()`、中间件栈和 `next()`,每一步都是类型安全的组合。

## 接入 Bun

```ts
Bun.serve({
  routes: { "/": index },              // 静态页(HMR)
  fetch: (req) => api.runWith404(req), // 后端 API
})
```

### 静态资源

```ts
import { staticApi } from "@diqye/gpress/static/bun/staticApi"

const api = G.path("/api").semiBind(userApi).alt(staticApi("./public"))
```

支持 GET/HEAD、Range 断点续传、路径穿越防护、404/416 错误处理。

## userData 与 responseHeaders

`userData` 在组合子之间传递任意数据(如认证信息),`responseHeaders` 累积响应头,最终由 `runWith404` 写入 Response。`userData` 类型为 `any`——泛型化会让每个组合子的类型签名爆炸,得不偿失。

## 依赖

- `zod` — Schema 验证

## 更多

- [文档生成与自动测试设计草稿](docs/design.md)
