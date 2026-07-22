const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Cadena de conexión PostgreSQL (Neon)
const connectionString = process.env.DATABASE_URL || 'postgresql://alex_owner:Abc123Xyz@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb?sslmode=require';

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

// Crear tablas si no existen al iniciar
async function inicializarTablas() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS equipos_medicos (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(150) NOT NULL,
                categoria VARCHAR(50) NOT NULL,
                precio NUMERIC(10, 2) NOT NULL,
                proveedor VARCHAR(150) NOT NULL,
                lat NUMERIC(10, 8) DEFAULT 24.0277,
                lng NUMERIC(11, 8) DEFAULT -104.6532,
                fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS solicitudes_renta (
                id SERIAL PRIMARY KEY,
                equipo VARCHAR(150) NOT NULL,
                precio NUMERIC(10, 2) NOT NULL,
                proveedor VARCHAR(150) NOT NULL,
                paciente VARCHAR(150) NOT NULL,
                telefono VARCHAR(50) NOT NULL,
                direccion TEXT NOT NULL,
                fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("⚡ Base de datos PostgreSQL sincronizada perfectamente.");
    } catch (err) {
        console.error("Error al inicializar tablas:", err);
    }
}
inicializarTablas();

// API: Obtener Equipos
app.get('/api/equipos', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM equipos_medicos ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Publicar Nuevo Equipo
app.post('/api/equipos', async (req, res) => {
    const { nombre, categoria, precio, proveedor, lat, lng } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO equipos_medicos (nombre, categoria, precio, proveedor, lat, lng) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [nombre, categoria, precio, proveedor, lat, lng]
        );
        res.json({ exito: true, equipo: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Eliminar Equipo (Función Administrador)
app.delete('/api/equipos/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM equipos_medicos WHERE id = $1', [id]);
        res.json({ exito: true, mensaje: 'Equipo eliminado correctamente' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Guardar Solicitud de Paciente
app.post('/api/solicitudes', async (req, res) => {
    const { equipo, precio, proveedor, paciente, telefono, direccion } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO solicitudes_renta (equipo, precio, proveedor, paciente, telefono, direccion) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [equipo, precio, proveedor, paciente, telefono, direccion]
        );
        res.json({ exito: true, solicitud: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Obtener Solicitudes de Renta
app.get('/api/solicitudes', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM solicitudes_renta ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`));