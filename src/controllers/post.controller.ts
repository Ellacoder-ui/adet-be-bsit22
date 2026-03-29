import type { Context } from "hono";
import pool from "../config/db.js";
import type {CreatePostModel, PostModel, UpdatePostModel } from "../models/post.model.js";
import type { ResultSetHeader } from "mysql2";


export async function getAllPosts (context: Context) {
    try {
        const [rows] = await pool.query<PostModel[]>(`SELECT * FROM posts`);
        return context.json(rows, 200);
    } catch (error) {
        console.log(error);
        return context.json({ message: 'Internal server error' }, 500);
    }
}

export async function getPostById(context: Context) {
    try {
        const id = context.req.param('id');
        const [rows] = await pool.query<PostModel[]>(`SELECT * FROM posts WHERE post_id = ?` , [id]);
        const data = rows[0];

        if (data) {
            return context.json(data, 200);
        }

        return context.json(null, 200);
    } catch (error) {
        console.log(error);
        return context.json({ message: 'Internal server error'}, 500);
    }
}

export async function createPost(context: Context) {
    try {
        const body: CreatePostModel= await context.req.json();
        const [result] = await pool.query<ResultSetHeader>
        (`INSERT INTO posts (title, description, status) VALUES (?, ?, ?)`, [body.title, body.description, body.status,]);

      if (result) {
        const id = result.insertId;
        const [data] = await pool.query<PostModel[]>(`SELECT * FROM posts WHERE post_id = ?`, [id]);
        const post = data[0];
        return context.json(post, 201);
      }

      return context.json({ message: "Failed to create post"}, 400);
    } catch (error) {
        console.log(error);
        return context.json({ message: "Internal server error" }, 500);
    }
}

export async function deletePostById(context: Context) {
    try {
        const id = context.req.param('id');
        const [result] = await pool.query<ResultSetHeader>(`DELETE FROM posts WHERE post_id = ?`, [id]);

        if (result.affectedRows > 0) {
            return context.json({ message: "Post successfully deleted"}, 200);
        }

        return context.json({ message: "Post server error"}, 404);
    } catch (error) {
        return context.json({ message: "Internal server error" }, 500);
    }
}

export async function updatePostById(context: Context) {
    try {
        const id = context.req.param('id');
        const body: UpdatePostModel = await context.req.json();

        if (!body.title && !body.description && !body.status) {
            return context.json({ message: "No fields to update" }, 400);
        }

        if (body.title) {
            await pool.query("UPDATE posts SET title = ? WHERE post_id = ?", [body.title, id]);
        }

        if (body.description) {
            await pool.query("UPDATE posts SET description = ? WHERE post_id = ?", [body.description, id]);
        }

        if (body.status) {
            await pool.query("UPDATE posts SET status = ? WHERE post_id = ?", [body.status, id]);
        }

        const [rows] = await pool.query<PostModel[]>("SELECT * FROM posts WHERE post_id = ?", [id]);
        if (rows.length === 0) {
            return context.json({ message: "Post not found" }, 404);
        }

        return context.json(rows[0], 200);

    } catch (error) {
        console.log(error);
        return context.json({ message: "Internal Server Error" }, 500);
    }
}
