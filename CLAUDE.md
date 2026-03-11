# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**gpress** - A routing framework focusing on Request to Response implementation, supporting both backend and frontend runtime.

## Commands

- `bun ./index.ts` - Run the server
- `bun test` - Run tests

## Architecture

This is a monomorphic routing library using functional composition patterns:

- `G<T>` - Main handler class representing a route
- `Final<A>` - Return type with three states: `final` (success with value), `continue` (no match), `end` (response sent)
- Route handlers compose via `bind`, `map`, `alt`, `semiBind`, `semiBindTap`

Key routing methods:
- `.get()`, `.post()`, `.put()`, `.patch()`, `.delete()` - HTTP method matching
- `.path(path: string)` - Match exact path segments
- `.pathOne(name?: string)` - Match single path segment
- `.nullPath()` - Match empty remainder
- `.restpaths()` - Get remaining path segments

Data extraction:
- `.request()` - Get Request object
- `.requestJson()` - Parse JSON body (auto-returns 400 on parse failure)
- `.requestUrl()` - Get URL object
- `.headers()` - Get Headers object
- `.zodParse(schema)` - Validate data with Zod schema

Run handlers:
- `.run(request)` - Execute handler, returns Final type
- `.runWith404(request)` - Execute with automatic 404 response

## Dependencies

- `zod` - Schema validation
- `bun:test` - Testing framework
