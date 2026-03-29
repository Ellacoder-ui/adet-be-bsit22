import { Hono } from "hono";
import { getAllPosts, getPostById, createPost, deletePostById, updatePostById} from "../controllers/post.controller.js";

const postRoute = new Hono();

postRoute.get("/", getAllPosts);
postRoute.get("/:id", getPostById);
postRoute.post("/", createPost); 
postRoute.delete('/:id', deletePostById);
postRoute.patch('/:id', updatePostById);

export default postRoute;
