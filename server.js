require("dotenv").config();

const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

const tokens = new Map();

function generateToken() {
    return crypto.randomBytes(32).toString("hex");
}

function verifyPassword(password, stored) {
    const [salt, hash] = stored.split(":");
    const hashToCompare = crypto.scryptSync(password, salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(hashToCompare, "hex"));
}

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Token requerido" });
    }
    const token = authHeader.split(" ")[1];
    if (!tokens.has(token)) {
        return res.status(401).json({ error: "Token inválido" });
    }
    next();
}

app.post("/login", (req, res) => {
    const { password } = req.body;
    const storedHash = process.env.AUTH_PASSWORD_HASH;

    if (!storedHash || !verifyPassword(password, storedHash)) {
        return res.status(401).json({ error: "Contraseña incorrecta" });
    }

    const token = generateToken();
    tokens.set(token, { createdAt: Date.now() });
    res.json({ token });
});

app.post("/logout", (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];
        tokens.delete(token);
    }
    res.json({ message: "Sesión cerrada" });
});

app.get("/attendance", authMiddleware, async (req, res) => {
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