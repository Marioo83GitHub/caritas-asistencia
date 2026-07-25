require("dotenv").config();

const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const ExcelJS = require("exceljs");

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

app.get("/attendance/export", authMiddleware, async (req, res) => {
    try {
        const { from, to } = req.query;

        if (!from || !to) {
            return res.status(400).json({ error: "Se requieren parámetros 'from' y 'to'" });
        }

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
                AND t.punch_time >= $1
                AND t.punch_time < $2::timestamp + interval '1 day'
            ORDER BY t.punch_time ASC;
        `, [from, to]);

        const records = result.rows;

        if (records.length === 0) {
            return res.status(404).json({ error: "No hay registros en el rango seleccionado" });
        }

        const byMonth = {};
        for (const r of records) {
            const date = new Date(r.punch_time);
            const hondurasMs = date.getTime() + (-6) * 3600000;
            const h = new Date(hondurasMs);
            const key = `${h.getUTCFullYear()}-${String(h.getUTCMonth() + 1).padStart(2, "0")}`;
            if (!byMonth[key]) byMonth[key] = [];
            byMonth[key].push(r);
        }

        const workbook = new ExcelJS.Workbook();
        workbook.creator = "Cáritas de Honduras";
        workbook.created = new Date();

        const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

        for (const [key, monthRecords] of Object.entries(byMonth).sort()) {
            const [year, month] = key.split("-");
            const sheetName = `${monthNames[parseInt(month) - 1]} ${year}`;
            const sheet = workbook.addWorksheet(sheetName);

            sheet.columns = [
                { header: "Empleado", key: "employee", width: 35 },
                { header: "Fecha", key: "date", width: 12 },
                { header: "Hora", key: "time", width: 10 },
                { header: "Tipo", key: "type", width: 10 },
                { header: "Terminal", key: "terminal", width: 20 }
            ];

            sheet.getRow(1).font = { bold: true };
            sheet.getRow(1).fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FF4361EE" }
            };
            sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

            for (const r of monthRecords) {
                const date = new Date(r.punch_time);
                const hondurasMs = date.getTime() + (-6) * 3600000;
                const h = new Date(hondurasMs);
                const dateStr = `${h.getUTCFullYear()}-${String(h.getUTCMonth() + 1).padStart(2, "0")}-${String(h.getUTCDate()).padStart(2, "0")}`;
                const timeStr = `${String(h.getUTCHours()).padStart(2, "0")}:${String(h.getUTCMinutes()).padStart(2, "0")}`;
                const typeStr = r.punch_state === "0" ? "Entrada" : "Salida";

                sheet.addRow({
                    employee: r.employee,
                    date: dateStr,
                    time: timeStr,
                    type: typeStr,
                    terminal: r.terminal_alias
                });
            }
        }

        const buffer = await workbook.xlsx.writeBuffer();
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename=asistencia_${from}_${to}.xlsx`);
        res.send(buffer);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al generar el archivo" });
    }
});


app.listen(process.env.PORT, "0.0.0.0", () => {
    console.log(`Servidor corriendo en puerto ${process.env.PORT}`);
});