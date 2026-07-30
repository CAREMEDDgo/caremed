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

// Inicializar Tablas para el modelo de Membresías Preventivas
async function inicializarTablas() {
    try {
        await pool.query(`
            -- Tabla de Usuarios y sus Membresías
            CREATE TABLE IF NOT EXISTS usuarios_membresias (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(150) NOT NULL,
                telefono VARCHAR(50) NOT NULL,
                plan VARCHAR(50) NOT NULL, -- 'Esencial', 'Plus', 'Premium'
                monto NUMERIC(10, 2) NOT NULL,
                estudios_restantes INT DEFAULT 12,
                fecha_inicio TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Tabla de Clínicas y Laboratorios en Convenio
            CREATE TABLE IF NOT EXISTS clinicas_convenio (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(150) NOT NULL,
                categoria VARCHAR(50) NOT NULL, -- 'Economico', 'Medio', 'Hospital'
                plan_minimo VARCHAR(50) NOT NULL, -- 'Esencial', 'Plus', 'Premium'
                direccion TEXT NOT NULL,
                lat NUMERIC(10, 8) NOT NULL,
                lng NUMERIC(11, 8) NOT NULL
            );

            -- Tabla de Citas y Estudios Agendados
            CREATE TABLE IF NOT EXISTS citas_estudios (
                id SERIAL PRIMARY KEY,
                usuario_id INT REFERENCES usuarios_membresias(id) ON DELETE CASCADE,
                paciente VARCHAR(150) NOT NULL,
                estudio VARCHAR(150) NOT NULL,
                mes_programado VARCHAR(50) NOT NULL,
                clinica VARCHAR(150) NOT NULL,
                codigo_qr VARCHAR(100) UNIQUE NOT NULL,
                estado VARCHAR(50) DEFAULT 'Agendado', -- 'Agendado', 'Completado'
                fecha_cita DATE NOT NULL
            );
        `);

        // Insertar clínicas base de Durango si la tabla está vacía
        const checkClinicas = await pool.query('SELECT COUNT(*) FROM clinicas_convenio');
        if (parseInt(checkClinicas.rows[0].count) === 0) {
            await pool.query(`
                INSERT INTO clinicas_convenio (nombre, categoria, plan_minimo, direccion, lat, lng) VALUES
                ('Laboratorio Del Guadiana', 'Economico', 'Esencial', 'Col. Centro, Durango', 24.0250, -104.6680),
                ('Laboratorio Santa María', 'Economico', 'Esencial', 'Fracc. Huizache, Durango', 24.0180, -104.6520),
                ('Laboratorio Gálvez', 'Economico', 'Esencial', 'Zona Centro, Durango', 24.0290, -104.6610),
                ('Salud Digna Durango', 'Medio', 'Plus', 'Av. 20 de Noviembre #801, Centro', 24.0265, -104.6650),
                ('Laboratorio Chopo', 'Medio', 'Plus', 'Blvd. Dolores del Río, Durango', 24.0220, -104.6580),
                ('Laboratorio San Jorge', 'Medio', 'Plus', 'Av. Universidad, Durango', 24.0350, -104.6490),
                ('Hospital San Jorge', 'Hospital', 'Premium', 'Av. Hidalgo #412, Centro', 24.0285, -104.6630),
                ('Hospital del Parque', 'Hospital', 'Premium', 'Calle del Parque, Durango', 24.0150, -104.6700),
                ('Hospital La Paz', 'Hospital', 'Premium', 'Blvd. Francisco Villa, Durango', 24.0410, -104.6320);
            `);
            console.log("🏥 Clínicas y Laboratorios de Durango registrados por defecto.");
        }

        console.log("⚡ Base de Datos PostgreSQL reestructurada con éxito.");
    } catch (err) {
        console.error("Error al inicializar tablas:", err);
    }
}
inicializarTablas();

/* ==================== API ENDPOINTS ==================== */

// 1. Obtener Clínicas filtradas por el Plan del usuario
app.get('/api/clinicas', async (req, res) => {
    const { plan } = req.query; // 'Esencial', 'Plus', 'Premium'
    try {
        let query = 'SELECT * FROM clinicas_convenio';
        let params = [];

        if (plan === 'Esencial') {
            query += " WHERE plan_minimo = 'Esencial'";
        } else if (plan === 'Plus') {
            query += " WHERE plan_minimo IN ('Esencial', 'Plus')";
        }
        // Si es Premium, no se filtra nada (ve todas las clínicas)

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Registrar nueva Suscripción a Membresía
app.post('/api/membresias/suscripcion', async (req, res) => {
    const { nombre, telefono, plan, monto } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO usuarios_membresias (nombre, telefono, plan, monto) VALUES ($1, $2, $3, $4) RETURNING *',
            [nombre, telefono, plan, monto]
        );
        res.json({ exito: true, usuario: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Agendar Estudio / Cita Preventiva
app.post('/api/citas/agendar', async (req, res) => {
    const { usuario_id, paciente, estudio, mes_programado, clinica, fecha_cita } = req.body;
    const codigo_qr = 'CARE-' + Math.floor(100000 + Math.random() * 900000); // Genera QR simulado

    try {
        const result = await pool.query(
            `INSERT INTO citas_estudios (usuario_id, paciente, estudio, mes_programado, clinica, codigo_qr, fecha_cita) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [usuario_id, paciente, estudio, mes_programado, clinica, codigo_qr, fecha_cita]
        );

        // Descontar 1 estudio del saldo del usuario
        await pool.query('UPDATE usuarios_membresias SET estudios_restantes = estudios_restantes - 1 WHERE id = $1', [usuario_id]);

        res.json({ exito: true, cita: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Obtener Citas de un Usuario
app.get('/api/citas/usuario/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM citas_estudios WHERE usuario_id = $1 ORDER BY id DESC', [req.params.id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. Panel General Administrador (Ver todos los suscriptores y citas)
app.get('/api/admin/resumen', async (req, res) => {
    try {
        const suscriptores = await pool.query('SELECT * FROM usuarios_membresias ORDER BY id DESC');
        const citas = await pool.query('SELECT * FROM citas_estudios ORDER BY id DESC');
        res.json({ suscriptores: suscriptores.rows, citas: citas.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. Eliminar Suscripción (Administración)
app.delete('/api/admin/suscripcion/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM usuarios_membresias WHERE id = $1', [req.params.id]);
        res.json({ exito: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor CAREMED ejecutándose en el puerto ${PORT}`));