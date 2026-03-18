import { G } from "../../Gpress";
import * as p from "path"


export const staticApi: (serveDir:string) => G<Response> = serveDir =>
G.empty()
.semiBind(G.get().alt(G.head()))
.semiBind(G.pathOne().many())
.bind(paths => G.headers().bind(async headers=> {
    const filePath = p.join(serveDir,...paths)
    const file = Bun.file(filePath)
    const existsFile = await file.exists()
    if(existsFile == false) {
        return G.pureText("File not font",{status: 404})
    }
    const fileSize = file.size

    if(headers.has("range") == false) {
        return G.pure(
            new Response(file)
        )
    }

    const rangeHeader = headers.get("range")!
    // 解析 range: bytes=start-end
    const rangeMatch = rangeHeader.match(/bytes=(\d*)-(\d*)/)
    if (!rangeMatch) {
        return G.pureText("Invalid Range", { status: 416 })
    }

    let start = rangeMatch[1] ? parseInt(rangeMatch[1]) : 0
    let end = rangeMatch[2] ? parseInt(rangeMatch[2]) : fileSize - 1

    // 处理无效范围
    if (start >= fileSize || end >= fileSize || start > end) {
        return G.pureText("Range Not Satisfiable", {
            status: 416,
            headers: { "Content-Range": `bytes */${fileSize}` }
        })
    }

    const contentLength = end - start + 1
    const slicedFile = file.slice(start, end + 1)

    return G.pure(new Response(slicedFile, {
        status: 206,
        headers: {
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Accept-Ranges": "bytes",
            "Content-Length": contentLength.toString()
        }
    }))
}))