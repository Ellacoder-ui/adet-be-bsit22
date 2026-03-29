import type { RowDataPacket } from "mysql2";

export interface PostModel extends RowDataPacket {
    post_id: string;
    title: string;
    description: string;
    status: 'Active' | 'Inactive';
    created_at: Date;
}

export interface CreatePostModel {
    title: string;
    description: string;
    status: 'Active' | 'Inactive';

}

export interface UpdatePostModel {
    title: string;
    description: string;
    status: 'Active' | 'Inactive';

}