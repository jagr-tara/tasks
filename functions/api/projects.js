// Cloudflare Pages Function: /api/projects
// Handles GET, POST, PUT, and DELETE against Cloudflare D1 (env.DB) with password authentication
// Represents projects and nested sub-projects (items where parent_id IS NOT NULL)

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
      "SELECT id, name, group_name, parent_id FROM projects ORDER BY id ASC"
    ).all();

    return jsonResponse({ projects: results || [] });
  } catch (error) {
    return jsonResponse({ error: error.message || "Failed to fetch projects." }, 500);
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
    const name = typeof payload.name === "string" ? payload.name.trim() : "";

    if (!name) {
      return jsonResponse({ error: "Project name is required." }, 400);
    }

    const parentId =
      payload.parent_id !== undefined && payload.parent_id !== null && payload.parent_id !== ""
        ? Number(payload.parent_id)
        : null;

    let groupName = null;
    if (typeof payload.group_name === "string" && payload.group_name.trim()) {
      groupName = payload.group_name.trim();
    } else if (parentId === null) {
      groupName = "General";
    }

    let createdProject = null;
    try {
      createdProject = await env.DB.prepare(
        "INSERT INTO projects (name, group_name, parent_id) VALUES (?, ?, ?) RETURNING id, name, group_name, parent_id"
      )
        .bind(name, groupName, parentId)
        .first();
    } catch {
      // Fallback for environments lacking RETURNING support
      const insertResult = await env.DB.prepare(
        "INSERT INTO projects (name, group_name, parent_id) VALUES (?, ?, ?)"
      )
        .bind(name, groupName, parentId)
        .run();

      const lastRowId = insertResult.meta?.last_row_id;
      createdProject = await env.DB.prepare(
        "SELECT id, name, group_name, parent_id FROM projects WHERE id = ?"
      )
        .bind(lastRowId)
        .first();
    }

    return jsonResponse({ project: createdProject }, 201);
  } catch (error) {
    return jsonResponse({ error: error.message || "Failed to create project." }, 500);
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
      return jsonResponse({ error: "Project ID is required." }, 400);
    }

    const existingProject = await env.DB.prepare(
      "SELECT id, name, group_name, parent_id FROM projects WHERE id = ?"
    )
      .bind(id)
      .first();

    if (!existingProject) {
      return jsonResponse({ error: "Project not found." }, 404);
    }

    const updatedName =
      typeof payload.name === "string" ? payload.name.trim() : existingProject.name;

    if (!updatedName) {
      return jsonResponse({ error: "Project name cannot be empty." }, 400);
    }

    const updatedGroup =
      payload.group_name !== undefined
        ? (typeof payload.group_name === "string" && payload.group_name.trim() ? payload.group_name.trim() : null)
        : existingProject.group_name;

    const updatedParentId =
      payload.parent_id !== undefined
        ? (payload.parent_id !== null && payload.parent_id !== "" ? Number(payload.parent_id) : null)
        : existingProject.parent_id;

    await env.DB.prepare(
      "UPDATE projects SET name = ?, group_name = ?, parent_id = ? WHERE id = ?"
    )
      .bind(updatedName, updatedGroup, updatedParentId, id)
      .run();

    const updatedProject = await env.DB.prepare(
      "SELECT id, name, group_name, parent_id FROM projects WHERE id = ?"
    )
      .bind(id)
      .first();

    return jsonResponse({ project: updatedProject });
  } catch (error) {
    return jsonResponse({ error: error.message || "Failed to update project." }, 500);
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
      return jsonResponse({ error: "Project ID is required." }, 400);
    }

    // Cascade delete subprojects under this parent project
    await env.DB.prepare("DELETE FROM projects WHERE parent_id = ?").bind(id).run();

    // Detach any todos referencing this project or its sub-projects
    await env.DB.prepare("UPDATE todos SET project_id = NULL WHERE project_id = ?").bind(id).run();

    const result = await env.DB.prepare("DELETE FROM projects WHERE id = ?").bind(id).run();

    if (result.meta?.changes === 0) {
      return jsonResponse({ error: "Project not found." }, 404);
    }

    return jsonResponse({ success: true, id: Number(id) || id });
  } catch (error) {
    return jsonResponse({ error: error.message || "Failed to delete project." }, 500);
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
