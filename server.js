require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();

app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

app.get("/attendance", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                concat(e.first_name, ' ', e.last_name) AS employee,
                t.punch_time,
                t.punch_state,
                t.terminal_alias
            FROM iclock_transaction t
            JOIN personnel_employee e
                ON e.id = t.emp_id
            WHERE e.deleted = false
            ORDER BY t.punch_time DESC
            LIMIT 100;
        `);

        res.json(result.rows);

    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Database error"
        });
    }
});


app.listen(process.env.PORT, "0.0.0.0", () => {
    console.log(`Servidor corriendo en puerto ${process.env.PORT}`);
});