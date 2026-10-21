// Cloudflare Pages Function: /api/todos
// Handles GET, POST, PUT, and DELETE against Cloudflare D1 (env.DB) with password authentication

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-App-Password",
    },
  });
}

function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-App-Password",
      "Access-Control-Max-Age": "86400",
    },
  });
}

function authenticate(request, env) {
  if (request.method.toUpperCase() === "OPTIONS") {
    return null;
  }
  const expectedPassword = env.APP_PASSWORD;
  const providedPassword = request.headers.get("X-App-Password");

  if (!expectedPassword || providedPassword !== expectedPassword) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  return null;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const authError = authenticate(request, env);
  if (authError) return authError;

  if (!env.DB) {
    return jsonResponse({ error: "D1 database binding 'DB' is missing." }, 500);
  }

  try {
    const { results } = await env.DB.prepare(
      "SELECT id, title, completed, created_at FROM todos ORDER BY created_at DESC, id DESC"
    ).all();

    return jsonResponse({ todos: results || [] });
  } catch (error) {
    return jsonResponse({ error: error.message || "Failed to fetch tasks." }, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const authError = authenticate(request, env);
  if (authError) return authError;

  if (!env.DB) {
    return jsonResponse({ error: "D1 database binding 'DB' is missing." }, 500);
  }

  try {
    const payload = await request.json().catch(() => ({}));
    const title = typeof payload.title === "string" ? payload.title.trim() : "";

    if (!title) {
      return jsonResponse({ error: "Task title is required." }, 400);
    }

    let createdTask = null;
    try {
      createdTask = await env.DB.prepare(
        "INSERT INTO todos (title, completed, created_at) VALUES (?, 0, datetime('now')) RETURNING id, title, completed, created_at"
      )
        .bind(title)
        .first();
    } catch {
      // Fallback for environments lacking RETURNING support
      const insertResult = await env.DB.prepare(
        "INSERT INTO todos (title, completed, created_at) VALUES (?, 0, datetime('now'))"
      )
        .bind(title)
        .run();

      const lastRowId = insertResult.meta?.last_row_id;
      createdTask = await env.DB.prepare(
        "SELECT id, title, completed, created_at FROM todos WHERE id = ?"
      )
        .bind(lastRowId)
        .first();
    }

    return jsonResponse({ todo: createdTask }, 201);
  } catch (error) {
    return jsonResponse({ error: error.message || "Failed to create task." }, 500);
  }
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const authError = authenticate(request, env);
  if (authError) return authError;

  if (!env.DB) {
    return jsonResponse({ error: "D1 database binding 'DB' is missing." }, 500);
  }

  try {
    const url = new URL(request.url);
    const payload = await request.json().catch(() => ({}));

    const id = payload.id || url.searchParams.get("id");
    if (!id) {
      return jsonResponse({ error: "Task ID is required." }, 400);
    }

    const existingTask = await env.DB.prepare(
      "SELECT id, title, completed, created_at FROM todos WHERE id = ?"
    )
      .bind(id)
      .first();

    if (!existingTask) {
      return jsonResponse({ error: "Task not found." }, 404);
    }

    const updatedTitle =
      typeof payload.title === "string" ? payload.title.trim() : existingTask.title;

    if (!updatedTitle) {
      return jsonResponse({ error: "Task title cannot be empty." }, 400);
    }

    let updatedCompleted = existingTask.completed;
    if (typeof payload.completed === "boolean") {
      updatedCompleted = payload.completed ? 1 : 0;
    } else if (payload.completed !== undefined) {
      updatedCompleted = Number(payload.completed) ? 1 : 0;
    }

    await env.DB.prepare(
      "UPDATE todos SET title = ?, completed = ? WHERE id = ?"
    )
      .bind(updatedTitle, updatedCompleted, id)
      .run();

    const updatedTask = await env.DB.prepare(
      "SELECT id, title, completed, created_at FROM todos WHERE id = ?"
    )
      .bind(id)
      .first();

    return jsonResponse({ todo: updatedTask });
  } catch (error) {
    return jsonResponse({ error: error.message || "Failed to update task." }, 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const authError = authenticate(request, env);
  if (authError) return authError;

  if (!env.DB) {
    return jsonResponse({ error: "D1 database binding 'DB' is missing." }, 500);
  }

  try {
    const url = new URL(request.url);
    let id = url.searchParams.get("id");

    if (!id) {
      const payload = await request.json().catch(() => ({}));
      id = payload.id;
    }

    if (!id) {
      return jsonResponse({ error: "Task ID is required." }, 400);
    }

    const result = await env.DB.prepare("DELETE FROM todos WHERE id = ?").bind(id).run();

    if (result.meta?.changes === 0) {
      return jsonResponse({ error: "Task not found." }, 404);
    }

    return jsonResponse({ success: true, id: Number(id) || id });
  } catch (error) {
    return jsonResponse({ error: error.message || "Failed to delete task." }, 500);
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const authError = authenticate(request, env);
  if (authError) return authError;

  switch (request.method.toUpperCase()) {
    case "GET":
      return onRequestGet(context);
    case "POST":
      return onRequestPost(context);
    case "PUT":
      return onRequestPut(context);
    case "DELETE":
      return onRequestDelete(context);
    case "OPTIONS":
      return handleOptions();
    default:
      return jsonResponse({ error: "Method not allowed." }, 405);
  }
}
