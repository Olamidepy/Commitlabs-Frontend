import { describe, it, expect } from "vitest";
import { ok, fail, methodNotAllowed } from "./apiResponse";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// ok()
// ---------------------------------------------------------------------------

describe("ok", () => {
  it("returns 200 with success:true and data", async () => {
    const res = ok({ id: 1 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ id: 1 });
    expect(body.meta).toBeUndefined();
  });

  it("accepts a custom status code as the second argument", async () => {
    const res = ok({ created: true }, 201);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("includes meta when a meta object is passed as the second argument", async () => {
    const res = ok([1, 2, 3], { total: 3, page: 1 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.meta).toEqual({ total: 3, page: 1 });
  });

  it("uses custom status with meta when both are provided", async () => {
    const res = ok({ items: [] }, { total: 0 }, 206);
    expect(res.status).toBe(206);
    const body = await res.json();
    expect(body.meta).toEqual({ total: 0 });
  });
});

// ---------------------------------------------------------------------------
// fail()
// ---------------------------------------------------------------------------

describe("fail", () => {
  it("returns 500 by default with success:false", async () => {
    const res = fail("INTERNAL_ERROR", "Something went wrong");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("Something went wrong");
    expect(body.error.details).toBeUndefined();
  });

  it("accepts a custom status code", async () => {
    const res = fail("NOT_FOUND", "Not found", undefined, 404);
    expect(res.status).toBe(404);
  });

  it("includes details when provided", async () => {
    const res = fail("BAD_REQUEST", "Invalid input", { field: "email" }, 400);
    const body = await res.json();
    expect(body.error.details).toEqual({ field: "email" });
  });

  it("omits details when not provided", async () => {
    const res = fail("BAD_REQUEST", "Invalid input", undefined, 400);
    const body = await res.json();
    expect(body.error.details).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// methodNotAllowed()
// ---------------------------------------------------------------------------

describe("methodNotAllowed", () => {
  const baseUrl = "http://localhost:3000/api/test";

  it("returns a handler function", () => {
    const handler = methodNotAllowed(["GET"]);
    expect(typeof handler).toBe("function");
  });

  it("responds with status 405", async () => {
    const handler = methodNotAllowed(["GET"]);
    const res = handler(new NextRequest(baseUrl, { method: "POST" }));
    expect(res.status).toBe(405);
  });

  it("sets the Allow header to the joined allowed methods", () => {
    const handler = methodNotAllowed(["GET", "POST"]);
    const res = handler(new NextRequest(baseUrl, { method: "DELETE" }));
    expect(res.headers.get("Allow")).toBe("GET, POST");
  });

  it("body has success:false and code METHOD_NOT_ALLOWED", async () => {
    const handler = methodNotAllowed(["DELETE"]);
    const res = handler(new NextRequest(baseUrl, { method: "GET" }));
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("METHOD_NOT_ALLOWED");
  });

  it("message contains the allowed methods", async () => {
    const handler = methodNotAllowed(["PATCH", "PUT"]);
    const res = handler(new NextRequest(baseUrl, { method: "POST" }));
    const body = await res.json();
    expect(body.error.message).toContain("PATCH, PUT");
  });

  it("works with a single allowed method", async () => {
    const handler = methodNotAllowed(["POST"]);
    const res = handler(new NextRequest(baseUrl, { method: "GET" }));
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
  });

  it("returns identical responses for repeated calls (stateless)", async () => {
    const handler = methodNotAllowed(["GET"]);
    const r1 = handler(new NextRequest(baseUrl, { method: "PUT" }));
    const r2 = handler(new NextRequest(baseUrl, { method: "DELETE" }));
    expect(r1.status).toBe(r2.status);
    expect(r1.headers.get("Allow")).toBe(r2.headers.get("Allow"));
  });
});
