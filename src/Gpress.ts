import z from "zod"

export type Final<A> = {
    cos: "final",
    final: A,
    restnames: string [],
    userData:any,
    responseHeaders:Record<string,string>
} | {
    cos: "continue",
    userData:any,
    responseHeaders:Record<string,string>
} | {
    cos: "end",
    response:Response,
    userData:any,
    responseHeaders:Record<string,string>
}

type MaybePromise<T> = T | Promise<T>
export type GHandler<A> = (reqeust:Request,context:{
    requestUrl: URL,
    pathnames: string[],
    userData:any,
    responseHeaders:Record<string,string>
}) => MaybePromise<Final<A>>
export  class G<A> {
    handler: GHandler<A>

    private constructor(handler:GHandler<A>) {
        this.handler = handler
    }

    static fromHandler<A>(handler:GHandler<A>) {
        return new this(handler)
    }

    static pure<A>(a:A) {
        return this.fromHandler((req,context)=>{
            return {
                cos: "final",
                final: a,
                restnames: context.pathnames,
                responseHeaders: context.responseHeaders,
                userData: context.userData
            }
        })
    }
    static pureJson(obj:any,init?: ResponseInit) {
        return this.pure(Response.json(obj,init))
    }
    static pureText(text:string,init?: ResponseInit) {
        return this.pure(new Response(text,init))
    }
    static end(response:Response):G<never> {
        return this.fromHandler((req,context)=>{
            return {
                cos: "end",
                response,
                userData: context.userData,
                responseHeaders: context.responseHeaders
            }
        })
    }
    static endJson(obj:any,init?: ResponseInit) {
        return this.end(Response.json(obj,init))
    }
    static fail<A>() {
        return this.fromHandler((req,context)=>{
            return {cos: "continue"} as Final<A>
        })
    }
    static matchMethod(method:string): G<void> {
        return this.fromHandler((req,context) => {
            if(req.method != method) return {
                responseHeaders: context.responseHeaders,
                userData: context.userData,
                cos: "continue"
            }
            return {
                cos: "final",
                final: void 0,
                responseHeaders: context.responseHeaders,
                userData: context.userData,
                restnames: context.pathnames
            }
        })
    }
    static post() {
        return this.matchMethod("POST")
    }
    public post() {
        return this.semiBindTap(G.post())
    }
    static get() {
        return this.matchMethod("GET")
    }
    public get() {
        return this.semiBindTap(G.get())
    }
    static head() {
        return this.matchMethod("HEAD")
    }
    public head() {
        return this.semiBindTap(G.head())
    }
    static patch() {
        return this.matchMethod("PATCH")
    }
    public patch() {
        return this.semiBindTap(G.patch())
    }
    static delete() {
        return this.matchMethod("DELETE")
    }
    public delete() {
        return this.semiBindTap(G.delete())
    }
    static put() {
        return this.matchMethod("PUT")
    }
    public put() {
        return this.semiBindTap(G.put())
    }
    static pathOne(name?:string):G<string> {
        return this.fromHandler((req,context) => {
            const xs = context.pathnames

            if(xs.length == 0) return {
                responseHeaders: context.responseHeaders,
                userData: context.userData,
                cos: "continue"
            } as Final<string>
            if(name != null && xs[0] != name) return {
                responseHeaders: context.responseHeaders,
                userData: context.userData,
                cos: "continue"
            } as Final<string>

            return {
                cos: "final",
                final: decodeURIComponent(xs[0] as string),
                restnames: xs.slice(1),
                responseHeaders: context.responseHeaders,
                userData: context.userData,
            }
        })
    }
    public pathOne(name?:string) {
        return this.semiBind(G.pathOne(name))
    }
    static ePath(pattern: string): G<Record<string, string>> {
        let xs = pattern.split("/")
        if (xs[0] == "") xs = xs.slice(1)
        const segments = xs.map(s =>
            s.startsWith(":") ? { type: "param" as const, name: s.slice(1) }
                              : { type: "literal" as const, value: s }
        )
        return this.fromHandler((req, context): Final<Record<string, string>> => {
            const ctx_xs = context.pathnames
            if (ctx_xs.length !== segments.length) return {
                responseHeaders: context.responseHeaders,
                userData: context.userData,
                cos: "continue"
            }
            const params: Record<string, string> = {}
            for (let i = 0; i < segments.length; i++) {
                const seg = segments[i]!
                if (seg.type === "literal") {
                    if (ctx_xs[i] !== seg.value) return {
                        responseHeaders: context.responseHeaders,
                        userData: context.userData,
                        cos: "continue"
                    }
                } else {
                    params[seg.name] = decodeURIComponent(ctx_xs[i]!)
                }
            }
            return {
                cos: "final",
                final: params,
                restnames: [],
                responseHeaders: context.responseHeaders,
                userData: context.userData,
            }
        })
    }
    public ePath(pattern: string) {
        return this.semiBind(G.ePath(pattern))
    }

    static path(path:string) : G<string[]> {
        let xs = path.split("/")   
        if(xs[0] == "")  xs = xs.slice(1)
        return this.fromHandler((req,context):Final<string[]> => {
            const ctx_xs = context.pathnames
            if(xs.length > ctx_xs.length ) return {
                responseHeaders: context.responseHeaders,
                userData: context.userData,
                cos: "continue"
            }
            if(xs.join("/") != ctx_xs.slice(0,xs.length).join("/")) return {
                responseHeaders: context.responseHeaders,
                userData: context.userData,
                cos: "continue"
            }
            return {
                cos: "final",
                final: xs,
                responseHeaders: context.responseHeaders,
                userData: context.userData,
                restnames: ctx_xs.slice(xs.length) 
            }
        })
    }
    public path(path:string) {
        return this.semiBind(G.path(path))
    }
    static nullPath() {
        return G.restpaths().bind(xs=>{
            if(xs.length != 0) return G.fail()
            return G.empty()
        })
    }
    public nullPath() {
        return this.semiBindTap(G.nullPath())
    }
    static restpaths() {
        return this.fromHandler((req,context) => {
            return {
                cos: "final",
                final: context.pathnames,
                responseHeaders: context.responseHeaders,
                userData: context.userData,
                restnames: context.pathnames
            }
        })
    }
    static headers() {
        return this.fromHandler((req,context) => {
            return {
                cos: "final",
                final: req.headers,
                responseHeaders: context.responseHeaders,
                userData: context.userData,
                restnames: context.pathnames
            }
        })
    }
    public headers() {
        return this.semiBind(G.headers())
    }
    static request() {
        return this.fromHandler((req,context) => {
            return {
                cos: "final",
                final: req,
                responseHeaders: context.responseHeaders,
                userData: context.userData,
                restnames: context.pathnames
            }
        })
    }
    static userData(data?:any) {
        return this.fromHandler((req,context) => {
            return {
                cos: "final",
                final: context.userData,
                responseHeaders: context.responseHeaders,
                userData: data ? data : context.userData,
                restnames: context.pathnames
            }
        })
    }
    static appendHeader(name:string,value:string) {
        return this.fromHandler((req,context) => {
            return {
                cos: "final",
                final: void 0,
                responseHeaders: {...context.responseHeaders,...{[name]:value}},
                userData: context.userData,
                restnames: context.pathnames
            }
        })
    }
    static requestUrl() {
        return this.fromHandler((req,context) => {
            return {
                cos: "final",
                final: context.requestUrl,
                responseHeaders: context.responseHeaders,
                userData: context.userData,
                restnames: context.pathnames
            }
        })
    }
    public requestUrl() {
        return this.semiBind(G.requestUrl())
    }
    public request() {
        return this.semiBind(G.request())
    }
    static requestJson():G<unknown> {
        return this.request().bind(async req=>{
            try {
                return G.pure(await req.json())
            } catch {
                return G.endJson({
                    code: "INVALID_JSON",
                    message: "JSON解析失败"
                },{status:400,statusText: "Invalid JSON"})
            }
        })
    }
    public requestJson() {
        return this.semiBind(G.requestJson())
    }

    static zodParse<S extends z.ZodType>(schema:S,transEnd?:(err:any)=>any) {
        return (json:unknown):G<z.output<S>> => {
            const parsed = schema.safeParse(json)
            if(parsed.success == false) {
                if(transEnd) {
                    return G.endJson(transEnd(z.prettifyError(parsed.error))) as any
                }
                return G.endJson({
                    code:"zod-error",
                    message: z.prettifyError(parsed.error)
                }) as any
            }
            return G.pure(parsed.data)
        }
    }
    public zodParse<S extends z.ZodType>(schema:S) {
        return this.bind(G.zodParse(schema))
    }
    static empty():G<void> {
        return G.pure(void 0)
    }

    public bind<B>(fn:(a:A) => MaybePromise<G<B>>):G<B> {
        return G.fromHandler(async (request,context)=>{
            const final_a = await this.handler(request,context)
            if(final_a.cos != "final") return final_a
            const g = await fn(final_a.final)
            const final_b = await g.handler(request,{
                ...context,
                requestUrl: context.requestUrl,
                pathnames: final_a.restnames
            })
            return final_b
        })
    }

    public semiBind<B>(g:G<B>):G<B> {
        return this.bind(()=>g)
    }
    public semiBindTap<B>(g:G<B>):G<A> {
        return this.bind((x)=>g.map(()=>x))
    }
    public semiBindKey<K extends string, X>(
        key: K,
        p: G<X>
    ): G<A extends undefined | void | string | any [] ?  { [a in K]: X } : (A & { [a in K]: X })> {
        return this.bind(v =>
            p.map(v2 => ({
                ...(typeof v == "object" && !Array.isArray(v) ? v : {}),
                [key]: v2
            } as any))
        );
    }

    public onFinal(fn: (final: Final<A>) => MaybePromise<Final<A>>): G<A> {
        return G.fromHandler(async (req, ctx) => {
            return fn(await this.handler(req, ctx))
        })
    }

    public map<B>(fn:(a:A) => B): G<B> {
        return G.fromHandler(async (req,ctx)=>{
            const final = await this.handler(req,ctx)
            if(final.cos != "final") return final
            return {
                ...final,
                final: fn(final.final)
            }
        })
    }

    public alt<B>(g:G<B>):G<A|B> {
        return G.fromHandler(async (req,ctx):Promise<Final<A|B>> =>{
            const final = await this.handler(req,ctx)
            if(final.cos == "end") return final
            if(final.cos == "final") return final
            const final_b = await g.handler(req,ctx)
            return final_b
        })
    }

    public optional():G<A| undefined> {
        return G.fromHandler(async (req,ctx):Promise<Final<A|undefined>> =>{
            const final = await this.handler(req,ctx)
            if(final.cos != "continue") return final

            return {
                cos: "final",
                restnames: ctx.pathnames,
                responseHeaders: ctx.responseHeaders,
                userData: ctx.userData,
                final: void 0
            }
        })
    }
    
    public many():G<A[]> {
        return G.fromHandler(async (req,ctx):Promise<Final<A[]>> =>{
            let xs: A[] = []
            let lastCtx = ctx
            while(true) {
                const final = await this.handler(req,lastCtx)
                if(final.cos == "end") return final
                if(final.cos != "final") break
                xs.push(final.final)
                lastCtx = {
                    ...lastCtx,
                    pathnames: final.restnames 
                }
            }
            return {
                cos: "final",
                responseHeaders: lastCtx.responseHeaders,
                userData: lastCtx.userData,
                final: xs,
                restnames: lastCtx.pathnames
            }
        })
    }

    public log(prefix="") {
        return G.fromHandler(async (req,ctx)=>{
            console.log(prefix,ctx.pathnames)
            const final = await this.handler(req,ctx)
            console.log(prefix + "_end",final)
            return final
        })
    }

    public async run(request:Request,userData?:any) {
        const requestUrl = new URL(request.url)
        const final = this.handler(request,{
            userData,
            responseHeaders: {
                "route":"gpress"
            },
            requestUrl,
            pathnames: requestUrl.pathname.split("/").slice(1)
        })
        return final
    }
    public async runWith404(request:Request,userData?:any) {
        const final  = await this.run(request,userData)
        if(final.cos == "continue") {
            return new Response("404",{status:404,headers:{
                ...final.responseHeaders
            }})
        }
        if(final.cos == "end") {
            return appendHeaders(final.response,final.responseHeaders)
        }
        if(final.final instanceof Response) {
            return appendHeaders(final.final,final.responseHeaders)
        }

        return final.final

        function appendHeaders(res:Response,headers:Record<string, string>) {
            for(const [name,value] of Object.entries(headers)) {
                res.headers.append(name,value)
            }
            return res
        }
    }

}