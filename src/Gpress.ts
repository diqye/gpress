
import z from "zod"

type Flatten<T> = { [P in keyof T]: T[P] }

export type Final<A> = {
    cos: "final",
    final: A,
    restnames: string [],
} | {
    cos: "continue",
} | {
    cos: "end",
    response:Response
}

type MaybePromise<T> = T | Promise<T>
export type GHandler<A> = (reqeust:Request,context:{
    requestUrl: URL,
    pathnames: string[]
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
                restnames: context.pathnames
            }
        })
    }
    static pureJson(obj:any,init?: ResponseInit) {
        return this.pure(Response.json(obj,init))
    }
    static pureText(text:string,init?: ResponseInit) {
        return this.pure(new Response(text,init))
    }
    static end(response:Response):G<Response> {
        return this.fromHandler((req,context)=>{
            return {
                cos: "end",
                response
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
            if(req.method != method) return {cos: "continue"}
            return {
                cos: "final",
                final: void 0,
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

            if(xs.length == 0) return {cos: "continue"} as Final<string>
            if(name != null && xs[0] != name) return {cos: "continue"} as Final<string>

            return {
                cos: "final",
                final: xs[0] as string,
                restnames: xs.slice(1)
            }
        })
    }
    public pathOne(name?:string) {
        return this.semiBind(G.pathOne(name))
    }
    static path(path:string) : G<string[]> {
        let xs = path.split("/")   
        if(xs[0] == "")  xs = xs.slice(1)
        return this.fromHandler((req,context):Final<string[]> => {
            const ctx_xs = context.pathnames
            if(xs.length > ctx_xs.length ) return {cos: "continue"}
            if(xs.join("/") != ctx_xs.slice(0,xs.length).join("/")) return {cos: "continue"}
            return {
                cos: "final",
                final: xs,
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
                restnames: context.pathnames
            }
        })
    }
    static headers() {
        return this.fromHandler((req,context) => {
            return {
                cos: "final",
                final: req.headers,
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
                restnames: context.pathnames
            }
        })
    }
    static requestUrl() {
        return this.fromHandler((req,context) => {
            return {
                cos: "final",
                final: context.requestUrl,
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
    static requestJson() {
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
        return (json:any):G<z.output<S>> => {
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
    ): G<A extends undefined | void ?  { [a in K]: X } : (A & { [a in K]: X })> {
        return this.bind(v =>
            p.map(v2 => ({
                ...v,
                [key]: v2
            } as any))
        );
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
                final: xs,
                restnames: lastCtx.pathnames
            }
        })
    }

    public log(prefix="") {
        return G.fromHandler(async (req,ctx)=>{
            console.log(prefix,ctx.pathnames)
            const final = await this.handler(req,ctx)
            console.log("final=",final)
            return final
        })
    }

    public async run(request:Request) {
        const requestUrl = new URL(request.url)
        const final = this.handler(request,{
            requestUrl,
            pathnames: requestUrl.pathname.split("/").slice(1)
        })
        return final
    }
    public async runWith404(request:Request) {
        const final  = await this.run(request)
        if(final.cos == "continue") return new Response("404",{status:404})
        if(final.cos == "end") return final.response
        return final.final
    }

}