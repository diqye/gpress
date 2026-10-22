# 设计草稿:文档生成与自动测试

> 未实现,记录方案构想。

核心观察:`bind` 内部的业务逻辑是黑盒,无法自动提取。但 `bind` 之前的结构化部分都可以收集为元数据。

| 组合子 | 可自动提取 |
|--------|-----------|
| `exactPath("/user/:id")` | path + params |
| `.get()` / `.post()` | method |
| `.requestJson()` | 需要 JSON body |
| `.bind(fn)` | 黑盒,需手动声明产出 |

方案:给 `G` 加 `meta` 字段,组合子自动积累元数据,`bind` 的产出用 `.responseSchema()` 手动声明。

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

元数据结构:

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

每个组合子(path、get 等)创建新 G 时合并 meta,`bind` 不添加 meta 但保留已有的。文档生成只依赖结构化部分,不依赖黑盒逻辑。
