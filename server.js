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

// Inicializar Tablas
async function inicializarTablas() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios_membresias (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(150) NOT NULL,
                telefono VARCHAR(50) NOT NULL,
                sexo VARCHAR(20) DEFAULT 'General',
                plan VARCHAR(50) NOT NULL,
                modalidad_pago VARCHAR(20) DEFAULT 'Anual',
                monto NUMERIC(10, 2) NOT NULL,
                estudios_restantes INT DEFAULT 12,
                fecha_inicio TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS clinicas_convenio (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(150) NOT NULL,
                categoria VARCHAR(50) NOT NULL,
                plan_minimo VARCHAR(50) NOT NULL,
                direccion TEXT NOT NULL,
                lat NUMERIC(10, 8) NOT NULL,
                lng NUMERIC(11, 8) NOT NULL,
                comision_porcentaje NUMERIC(5, 2) DEFAULT 15.00
            );

            CREATE TABLE IF NOT EXISTS citas_estudios (
                id SERIAL PRIMARY KEY,
                usuario_id INT REFERENCES usuarios_membresias(id) ON DELETE SET NULL,
                paciente VARCHAR(150) NOT NULL,
                tipo_compra VARCHAR(50) DEFAULT 'Membresia',
                estudio VARCHAR(150) NOT NULL,
                monto_pagado NUMERIC(10, 2) DEFAULT 0.00,
                clinica VARCHAR(150) NOT NULL,
                comision_generada NUMERIC(10, 2) DEFAULT 0.00,
                codigo_qr VARCHAR(100) UNIQUE NOT NULL,
                estado VARCHAR(50) DEFAULT 'Agendado',
                fecha_cita DATE NOT NULL
            );
        `);

        // Recargar el catálogo completo de Clínicas y Hospitales de Durango
        await pool.query('DELETE FROM clinicas_convenio');
        await pool.query(`
            INSERT INTO clinicas_convenio (nombre, categoria, plan_minimo, direccion, lat, lng, comision_porcentaje) VALUES
            -- Paquete Esencial (Económicas / Locales)
            ('Laboratorio Gutiérrez', 'Económico', 'Esencial', 'Zona Centro, Durango', 24.0250, -104.6680, 15.00),
            ('Laboratorio San José', 'Económico', 'Esencial', 'Col. Hidalgo, Durango', 24.0180, -104.6520, 15.00),
            ('Laboratorio Clínico del Guadiana', 'Económico', 'Esencial', 'Calle Negrete #304, Centro', 24.0270, -104.6640, 15.00),
            ('Laboratorio Analiza', 'Económico', 'Esencial', 'Av. Normal, Durango', 24.0290, -104.6610, 15.00),
            ('Laboratorio Clínico del Norte', 'Económico', 'Esencial', 'Blvd. Jose Maria Morelos, Durango', 24.0380, -104.6510, 15.00),
            ('Laboratorio del Centro', 'Económico', 'Esencial', 'Calle Constitución #210, Centro', 24.0260, -104.6670, 15.00),

            -- Paquete Plus (Nivel Medio / Cadenas)
            ('Salud Digna Durango', 'Medio', 'Plus', 'Av. 20 de Noviembre #801, Centro', 24.0265, -104.6650, 12.00),
            ('Laboratorios Chopo', 'Medio', 'Plus', 'Blvd. Dolores del Río, Durango', 24.0220, -104.6580, 12.00),
            ('Laboratorio Juárez', 'Medio', 'Plus', 'Av. Juárez #405, Centro', 24.0240, -104.6620, 12.00),
            ('Laboratorio del Lago', 'Medio', 'Plus', 'Fracc. Los Remedios, Durango', 24.0350, -104.6490, 12.00),
            ('Laboratorio Biomédico Durango', 'Medio', 'Plus', 'Av. Felipe Pescador, Durango', 24.0310, -104.6590, 12.00),
            ('Laboratorio San Jorge', 'Medio', 'Plus', 'Av. Universidad #102, Durango', 24.0330, -104.6450, 12.00),

            -- Paquete Premium (Hospitales Privados)
            ('Hospital San Jorge', 'Hospital', 'Premium', 'Av. Hidalgo #412, Centro', 24.0285, -104.6630, 10.00),
            ('Hospital del Parque', 'Hospital', 'Premium', 'Calle del Parque #115, Durango', 24.0150, -104.6700, 10.00),
            ('Hospital La Paz', 'Hospital', 'Premium', 'Blvd. Francisco Villa #101, Durango', 24.0410, -104.6320, 10.00),
            ('Hospital Santa Bárbara', 'Hospital', 'Premium', 'Calle 5 de Febrero, Durango', 24.0245, -104.6690, 10.00);
        `);

        console.log("🏥 Red completa de Clínicas y Hospitales de Durango sincronizada.");
    } catch (err) {
        console.error("Error al inicializar tablas:", err);
    }
}
inicializarTablas();

/* ==================== API ENDPOINTS ==================== */

app.get('/api/clinicas', async (req, res) => {
    const { plan } = req.query;
    try {
        let query = 'SELECT * FROM clinicas_convenio';
        if (plan === 'Esencial') query += " WHERE plan_minimo = 'Esencial'";
        if (plan === 'Plus') query += " WHERE plan_minimo IN ('Esencial', 'Plus')";
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/membresias/suscripcion', async (req, res) => {
    const { nombre, telefono, sexo, plan, modalidad_pago, monto } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO usuarios_membresias (nombre, telefono, sexo, plan, modalidad_pago, monto) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [nombre, telefono, sexo, plan, modalidad_pago, monto]
        );
        res.json({ exito: true, usuario: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/citas/agendar', async (req, res) => {
    const { usuario_id, paciente, tipo_compra, estudio, monto_pagado, clinica, fecha_cita } = req.body;
    const codigo_qr = 'CARE-' + Math.floor(100000 + Math.random() * 900000);
    const comision = tipo_compra === 'Individual' ? (monto_pagado * 0.15) : 50.00;

    try {
        const result = await pool.query(
            `INSERT INTO citas_estudios (usuario_id, paciente, tipo_compra, estudio, monto_pagado, clinica, comision_generada, codigo_qr, fecha_cita) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [usuario_id || null, paciente, tipo_compra, estudio, monto_pagado || 0, clinica, comision, codigo_qr, fecha_cita]
        );

        if (tipo_compra === 'Membresia' && usuario_id) {
            await pool.query('UPDATE usuarios_membresias SET estudios_restantes = estudios_restantes - 1 WHERE id = $1', [usuario_id]);
        }

        res.json({ exito: true, cita: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Modificar fecha de una Cita
app.put('/api/citas/:id/fecha', async (req, res) => {
    const { nueva_fecha } = req.body;
    try {
        await pool.query('UPDATE citas_estudios SET fecha_cita = $1 WHERE id = $2', [nueva_fecha, req.params.id]);
        res.json({ exito: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Cancelar / Eliminar Cita por Error
app.delete('/api/citas/:id', async (req, res) => {
    try {
        const cita = await pool.query('SELECT * FROM citas_estudios WHERE id = $1', [req.params.id]);
        if (cita.rows.length > 0 && cita.rows[0].usuario_id && cita.rows[0].tipo_compra === 'Membresia') {
            // Reembolsar 1 estudio al usuario si era cita de membresía
            await pool.query('UPDATE usuarios_membresias SET estudios_restantes = estudios_restantes + 1 WHERE id = $1', [cita.rows[0].usuario_id]);
        }
        await pool.query('DELETE FROM citas_estudios WHERE id = $1', [req.params.id]);
        res.json({ exito: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/citas/usuario/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM citas_estudios WHERE usuario_id = $1 ORDER BY id DESC', [req.params.id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/resumen', async (req, res) => {
    try {
        const suscriptores = await pool.query('SELECT * FROM usuarios_membresias ORDER BY id DESC');
        const citas = await pool.query('SELECT * FROM citas_estudios ORDER BY id DESC');
        const comisionesPorClinica = await pool.query(`
            SELECT clinica, 
                   COUNT(*) as total_pacientes, 
                   SUM(comision_generada) as total_comision_a_cobrar
            FROM citas_estudios 
            GROUP BY clinica
            ORDER BY total_comision_a_cobrar DESC
        `);

        res.json({ 
            suscriptores: suscriptores.rows, 
            citas: citas.rows,
            comisiones: comisionesPorClinica.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/suscripcion/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM usuarios_membresias WHERE id = $1', [req.params.id]);
        res.json({ exito: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor CAREMED en puerto ${PORT}`));