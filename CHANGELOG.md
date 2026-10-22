# Changelog

## [Unreleased]

## v0.1.0 (2026-10-22)

### New Features

- 路由是可组合的值 - 无 router 实例、无副作用注册,`G<A>` 是普通值,可放进变量、传参、单测、任意组合
- 三状态模型 - `final`(成功携带值) / `continue`(不匹配,回溯) / `end`(响应已发送,终止),`alt` 具备真正的回溯能力
- 路径匹配 - `path` 前缀匹配、`ePath` 精确匹配(`:参数` 提取、`*rest` 通配尾段)、`pathOne`、`nullPath`、`restpaths`、`many`、`optional`
- HTTP 方法 - `get` / `post` / `put` / `patch` / `delete` / `head`
- 数据提取 - `request`、`requestJson`(解析失败自动 400)、`headers`、`requestUrl`、`userData`(组合子间传递任意数据)、`appendHeader`
- 组合子 - `bind`、`map`、`alt` / `G.alts`、`semiBind`、`semiBindTap`、`semiBindKey`、`onFinal`(拦截最终结果,改 header/替换响应/记日志)
- 响应构造 - `pureJson`、`pureText`、`end`、`endJson`
- 统一错误处理 - 业务错误 `throw G.error({httpcode?, code, message})` 走异常通道直达边界,`runWith404` 统一转 `{code, message}` + httpcode;预期外异常 log 后转 500,handler 不写 try/catch
- 运行 - `run` 返回 `Final<A>` 自行处理;`runWith404` 归一化 continue→404、异常→500,直接给 `Bun.serve` 的 fetch
- 静态资源 - `staticApi`:GET/HEAD、Range 断点续传、路径穿越防护、404/416 错误处理
- 零依赖 - 只依赖 Web 标准 `Request` / `Response`,任何运行时可跑;校验组合子由 app 层自建(README 提供 zod 推荐 5 行实现)
