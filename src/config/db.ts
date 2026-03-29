import mysql from 'mysql2/promise';

const dbConfig = {
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '123456',
    database: 'bsit_21',
    waitForConnections: true,
    connectionLimit: 10,
    queveLimit: 0,


};

const pool = mysql.createPool(dbConfig);

export default pool;