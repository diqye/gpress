# GPress

一个基于 Monad 组合思想的函数式框架，聚焦于 Request 到 Response 的实现。

## 核心思想

传统路由是这样的：

```ts
// 配置式
router.get("/user", handler)
router.post("/user", handler)
```

GPress 是这样的：

```ts
// 组合式
const api = G.path("/user")
  .get()
  .bind(getUser)
```

把路由、提取数据、业务逻辑、响应，都变成**可组合的函数**。

### 路由组合的三状态

- `G.pure` - 成功，携带值继续传递
- `G.fail` - 不匹配，尝试下一个
- `G.end` - 响应已发送，终止

### bind：异步组合

`.bind()` 支持 async，可以链式处理异步操作：

```ts
G.path("/api")
  .post()
  .requestJson()
  .zodParse(bodySchema) // zod 验证 json
  .bind(async (body) => {
    const user = await db.create(body)
    return G.pureJson(user)
  })
```

## 启动（全栈）

```ts
import { serve } from "bun"
import index from "./index.html"
import { api } from "./api"
import mp4 from "../public/video.mp4"

const server = serve({
  routes: {
    // 静态资源
    "/": index,
    "/video.mp4": Bun.file(mp4)
  },
  port: 7799,
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
  // 后端接口
  fetch: req => api.runWith404(req),
})

console.log(`🚀 Server running at ${server.url}`)
```

routes 放静态资源，fetch 放后端接口，一条命令启动全栈。

## 组合模式

`.alt()` 让多条路由并存：

```ts
// /api/user/xxx
// /api/order/xxx
// /api/product/xxx
const api:G<Response> = G.path("/api")
  .semiBind(auth)
  .semiBind(
    userRoutes
    .alt(orderRoutes)
    .alt(productRoutes)
  )
```

## 静态类型
所有函数均实现了严谨的类型，让你在自由组合的时候类型不丢失。

## 文档生成

同一套组合子，可以生成接口文档：

```ts
// 路由定义
const userRoutes = G.path("user")
  .semiBind(G.path("create").post().requestJson())
  .alt(G.path(":id").get())

// 生成文档
const docs = userRoutes.runDocs()
```

组合方式不变，runDocs 直接解析组合子输出 API 文档。
