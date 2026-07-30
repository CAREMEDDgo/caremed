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

// Inicialización de tablas y columnas con migración automática
async function inicializarEstructura() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios_membresias (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(150) NOT NULL,
                correo VARCHAR(150) UNIQUE NOT NULL,
                password VARCHAR(100) NOT NULL,
                telefono VARCHAR(50) NOT NULL,
                sexo VARCHAR(20) DEFAULT 'Hombre',
                plan VARCHAR(50) NOT NULL,
                modalidad_pago VARCHAR(20) DEFAULT 'Anual',
                monto NUMERIC(10, 2) NOT NULL DEFAULT 0,
                estudios_restantes INT DEFAULT 12,
                fecha_inicio TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS convenios_empresas (
                id SERIAL PRIMARY KEY,
                empresa_nombre VARCHAR(150) NOT NULL,
                contacto_nombre VARCHAR(150) NOT NULL,
                correo VARCHAR(150) NOT NULL,
                telefono VARCHAR(50) NOT NULL,
                plan_empresa VARCHAR(50) NOT NULL,
                visitas_garantizadas INT NOT NULL,
                monto NUMERIC(10, 2) NOT NULL,
                fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

        // ALTERAR TABLA CITAS_ESTUDIOS PARA REPARAR LA COLUMNA mes_programado Y FALTANTES
        await pool.query(`
            DO $$ 
            BEGIN 
                -- Quitar restriccion NOT NULL o borrar columna obsoleta mes_programado si existe
                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='citas_estudios' AND column_name='mes_programado') THEN
                    ALTER TABLE citas_estudios ALTER COLUMN mes_programado DROP NOT NULL;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='citas_estudios' AND column_name='tipo_compra') THEN
                    ALTER TABLE citas_estudios ADD COLUMN tipo_compra VARCHAR(50) DEFAULT 'Membresia';
                END IF;

                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='citas_estudios' AND column_name='monto_pagado') THEN
                    ALTER TABLE citas_estudios ADD COLUMN monto_pagado NUMERIC(10, 2) DEFAULT 0.00;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='citas_estudios' AND column_name='comision_generada') THEN
                    ALTER TABLE citas_estudios ADD COLUMN comision_generada NUMERIC(10, 2) DEFAULT 0.00;
                END IF;
            END $$;
        `);

        // Recargar catálogo completo de clínicas y hospitales en Durango
        await pool.query('DELETE FROM clinicas_convenio');
        await pool.query(`
            INSERT INTO clinicas_convenio (nombre, categoria, plan_minimo, direccion, lat, lng, comision_porcentaje) VALUES
            ('Laboratorio Gutiérrez', 'Económico', 'Esencial', 'Zona Centro, Durango', 24.0250, -104.6680, 15.00),
            ('Laboratorio San José', 'Económico', 'Esencial', 'Col. Hidalgo, Durango', 24.0180, -104.6520, 15.00),
            ('Laboratorio Clínico del Guadiana', 'Económico', 'Esencial', 'Calle Negrete #304, Centro', 24.0270, -104.6640, 15.00),
            ('Laboratorio Analiza', 'Económico', 'Esencial', 'Av. Normal, Durango', 24.0290, -104.6610, 15.00),
            ('Laboratorio Clínico del Norte', 'Económico', 'Esencial', 'Blvd. Jose Maria Morelos, Durango', 24.0380, -104.6510, 15.00),
            ('Laboratorio del Centro', 'Económico', 'Esencial', 'Calle Constitución #210, Centro', 24.0260, -104.6670, 15.00),
            ('Salud Digna Durango', 'Medio', 'Plus', 'Av. 20 de Noviembre #801, Centro', 24.0265, -104.6650, 12.00),
            ('Laboratorios Chopo', 'Medio', 'Plus', 'Blvd. Dolores del Río, Durango', 24.0220, -104.6580, 12.00),
            ('Laboratorio Juárez', 'Medio', 'Plus', 'Av. Juárez #405, Centro', 24.0240, -104.6620, 12.00),
            ('Laboratorio del Lago', 'Medio', 'Plus', 'Fracc. Los Remedios, Durango', 24.0350, -104.6490, 12.00),
            ('Laboratorio Biomédico Durango', 'Medio', 'Plus', 'Av. Felipe Pescador, Durango', 24.0310, -104.6590, 12.00),
            ('Hospital San Jorge', 'Hospital', 'Premium', 'Av. Hidalgo #412, Centro', 24.0285, -104.6630, 10.00),
            ('Hospital del Parque', 'Hospital', 'Premium', 'Calle del Parque #115, Durango', 24.0150, -104.6700, 10.00),
            ('Hospital La Paz', 'Hospital', 'Premium', 'Blvd. Francisco Villa #101, Durango', 24.0410, -104.6320, 10.00),
            ('Hospital Santa Bárbara', 'Hospital', 'Premium', 'Calle 5 de Febrero, Durango', 24.0245, -104.6690, 10.00);
        `);

        console.log("⚡ Base de datos PostgreSQL reconfigurada (desactivado NOT NULL de mes_programado).");
    } catch (err) {
        console.error("Error al inicializar PostgreSQL:", err);
    }
}
inicializarEstructura();

/* ==================== RUTAS DE AUTENTICACIÓN Y PERSONAS ==================== */

app.post('/api/auth/registro', async (req, res) => {
    const { nombre, correo, password, telefono, sexo, plan, modalidad_pago, monto } = req.body;
    try {
        const existe = await pool.query('SELECT * FROM usuarios_membresias WHERE correo = $1', [correo]);
        if (existe.rows.length > 0) {
            return res.status(400).json({ error: 'El correo electrónico ya está registrado.' });
        }

        const result = await pool.query(
            `INSERT INTO usuarios_membresias (nombre, correo, password, telefono, sexo, plan, modalidad_pago, monto) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [nombre, correo, password, telefono, sexo || 'Hombre', plan || 'Esencial', modalidad_pago || 'Anual', parseFloat(monto) || 0]
        );

        res.json({ exito: true, usuario: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { correo, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM usuarios_membresias WHERE correo = $1 AND password = $2', [correo, password]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
        }
        res.json({ exito: true, usuario: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/usuarios/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM usuarios_membresias WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* ==================== RUTAS B2B EMPRESAS Y CLINICAS ==================== */

app.post('/api/empresas/suscripcion', async (req, res) => {
    const { empresa_nombre, contacto_nombre, correo, telefono, plan_empresa, visitas_garantizadas, monto } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO convenios_empresas (empresa_nombre, contacto_nombre, correo, telefono, plan_empresa, visitas_garantizadas, monto)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [empresa_nombre, contacto_nombre, correo, telefono, plan_empresa, visitas_garantizadas, parseFloat(monto)]
        );
        res.json({ exito: true, empresa: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* ==================== CONSULTA DE CLINICAS Y CITAS ==================== */

app.get('/api/clinicas', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM clinicas_convenio ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/citas/agendar', async (req, res) => {
    const { usuario_id, paciente, tipo_compra, estudio, monto_pagado, clinica, fecha_cita } = req.body;
    const codigo_qr = 'CARE-' + Math.floor(100000 + Math.random() * 900000);
    const comision = tipo_compra === 'Individual' ? ((parseFloat(monto_pagado) || 0) * 0.15) : 50.00;

    try {
        const result = await pool.query(
            `INSERT INTO citas_estudios (usuario_id, paciente, tipo_compra, estudio, monto_pagado, clinica, comision_generada, codigo_qr, fecha_cita) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [usuario_id || null, paciente, tipo_compra || 'Membresia', estudio, monto_pagado || 0, clinica, comision, codigo_qr, fecha_cita]
        );

        if (tipo_compra === 'Membresia' && usuario_id) {
            await pool.query('UPDATE usuarios_membresias SET estudios_restantes = estudios_restantes - 1 WHERE id = $1', [usuario_id]);
        }

        res.json({ exito: true, cita: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/citas/:id/fecha', async (req, res) => {
    try {
        await pool.query('UPDATE citas_estudios SET fecha_cita = $1 WHERE id = $2', [req.body.nueva_fecha, req.params.id]);
        res.json({ exito: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/citas/:id', async (req, res) => {
    try {
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

/* ==================== RESUMEN DE ADMINISTRACIÓN B2B ==================== */

app.get('/api/admin/resumen', async (req, res) => {
    try {
        const suscriptores = await pool.query('SELECT * FROM usuarios_membresias ORDER BY id DESC');
        const empresas = await pool.query('SELECT * FROM convenios_empresas ORDER BY id DESC');
        const citas = await pool.query('SELECT * FROM citas_estudios ORDER BY id DESC');
        const comisionesPorClinica = await pool.query(`
            SELECT clinica, COUNT(*) as total_pacientes, COALESCE(SUM(comision_generada), 0) as total_comision_a_cobrar
            FROM citas_estudios GROUP BY clinica ORDER BY total_comision_a_cobrar DESC
        `);

        res.json({ 
            suscriptores: suscriptores.rows, 
            empresas: empresas.rows,
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
app.listen(PORT, () => console.log(`🚀 Servidor C.A.R.E.M.E.D. activo en puerto ${PORT}`));