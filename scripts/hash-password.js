const crypto = require("crypto");

const password = process.argv[2];

if (!password) {
    console.error("Uso: node scripts/hash-password.js <contraseña>");
    process.exit(1);
}

const salt = crypto.randomBytes(16).toString("hex");
const hash = crypto.scryptSync(password, salt, 64).toString("hex");

console.log(`\nHash generado:\n`);
console.log(`AUTH_PASSWORD_HASH=${salt}:${hash}`);
console.log(`\nCopia esta línea en tu archivo .env\n`);
