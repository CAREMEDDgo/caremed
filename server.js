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
            -- Tabla de Suscriptores
            CREATE TABLE IF NOT EXISTS usuarios_membresias (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(150) NOT NULL,
                telefono VARCHAR(50) NOT NULL,
                sexo VARCHAR(20) DEFAULT 'General', -- 'Hombre', 'Mujer'
                plan VARCHAR(50) NOT NULL, -- 'Esencial', 'Plus', 'Premium'
                modalidad_pago VARCHAR(20) DEFAULT 'Anual', -- 'Anual', 'Mensual'
                monto NUMERIC(10, 2) NOT NULL,
                estudios_restantes INT DEFAULT 12,
                fecha_inicio TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Tabla de Clínicas y Laboratorios en Convenio
            CREATE TABLE IF NOT EXISTS clinicas_convenio (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(150) NOT NULL,
                categoria VARCHAR(50) NOT NULL,
                plan_minimo VARCHAR(50) NOT NULL,
                direccion TEXT NOT NULL,
                lat NUMERIC(10, 8) NOT NULL,
                lng NUMERIC(11, 8) NOT NULL,
                comision_porcentaje NUMERIC(5, 2) DEFAULT 15.00 -- 15% de comisión estándar
            );

            -- Tabla de Citas y Estudios (Suscripción o Compra Individual)
            CREATE TABLE IF NOT EXISTS citas_estudios (
                id SERIAL PRIMARY KEY,
                usuario_id INT REFERENCES usuarios_membresias(id) ON DELETE SET NULL,
                paciente VARCHAR(150) NOT NULL,
                tipo_compra VARCHAR(50) DEFAULT 'Membresia', -- 'Membresia' o 'Individual'
                estudio VARCHAR(150) NOT NULL,
                monto_pagado NUMERIC(10, 2) DEFAULT 0.00,
                clinica VARCHAR(150) NOT NULL,
                comision_generada NUMERIC(10, 2) DEFAULT 0.00,
                codigo_qr VARCHAR(100) UNIQUE NOT NULL,
                estado VARCHAR(50) DEFAULT 'Agendado',
                fecha_cita DATE NOT NULL
            );
        `);

        // Insertar clínicas base
        const checkClinicas = await pool.query('SELECT COUNT(*) FROM clinicas_convenio');
        if (parseInt(checkClinicas.rows[0].count) === 0) {
            await pool.query(`
                INSERT INTO clinicas_convenio (nombre, categoria, plan_minimo, direccion, lat, lng, comision_porcentaje) VALUES
                ('Laboratorio Gutiérrez', 'Economico', 'Esencial', 'Zona Centro, Durango', 24.0250, -104.6680, 15.00),
                ('Laboratorio San José', 'Economico', 'Esencial', 'Col. Hidalgo, Durango', 24.0180, -104.6520, 15.00),
                ('Laboratorio Analiza', 'Economico', 'Esencial', 'Av. Normal, Durango', 24.0290, -104.6610, 15.00),
                ('Salud Digna Durango', 'Medio', 'Plus', 'Av. 20 de Noviembre #801, Centro', 24.0265, -104.6650, 12.00),
                ('Laboratorio Chopo', 'Medio', 'Plus', 'Blvd. Dolores del Río, Durango', 24.0220, -104.6580, 12.00),
                ('Laboratorio del Lago', 'Medio', 'Plus', 'Fracc. Los Remedios, Durango', 24.0350, -104.6490, 12.00),
                ('Hospital San Jorge', 'Hospital', 'Premium', 'Av. Hidalgo #412, Centro', 24.0285, -104.6630, 10.00),
                ('Hospital del Parque', 'Hospital', 'Premium', 'Calle del Parque, Durango', 24.0150, -104.6700, 10.00),
                ('Hospital La Paz', 'Hospital', 'Premium', 'Blvd. Francisco Villa, Durango', 24.0410, -104.6320, 10.00);
            `);
        }

        console.log("⚡ Base de Datos PostgreSQL actualizada con comisiones y géneros.");
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

// Agendar Cita (Suscripción o Compra Individual)
app.post('/api/citas/agendar', async (req, res) => {
    const { usuario_id, paciente, tipo_compra, estudio, monto_pagado, clinica, fecha_cita } = req.body;
    const codigo_qr = 'CARE-' + Math.floor(100000 + Math.random() * 900000);
    
    // Cálculo de comisión estimada (15% para compras individuales, $50 fijo por cita de membresía)
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

app.get('/api/citas/usuario/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM citas_estudios WHERE usuario_id = $1 ORDER BY id DESC', [req.params.id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Resumen General y Concentrado de Comisiones B2B
app.get('/api/admin/resumen', async (req, res) => {
    try {
        const suscriptores = await pool.query('SELECT * FROM usuarios_membresias ORDER BY id DESC');
        const citas = await pool.query('SELECT * FROM citas_estudios ORDER BY id DESC');
        
        // Concentrado de comisiones a cobrar por clínica
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
app.listen(PORT, () => console.log(`🚀 Servidor CAREMED con comisiones activo en puerto ${PORT}`));