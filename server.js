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

        // ALTERAR TABLA CITAS_ESTUDIOS
        await pool.query(`
            DO $$ 
            BEGIN 
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

        console.log("⚡ Base de datos PostgreSQL inicializada.");
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
        // 1. Guardar en convenios empresariales
        const result = await pool.query(
            `INSERT INTO convenios_empresas (empresa_nombre, contacto_nombre, correo, telefono, plan_empresa, visitas_garantizadas, monto)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [empresa_nombre, contacto_nombre, correo, telefono, plan_empresa, visitas_garantizadas, parseFloat(monto)]
        );

        // 2. Generar ubicación aleatoria en Durango para que aparezca en el mapa y menú
        const randomLat = (24.0200 + Math.random() * 0.0200).toFixed(4);
        const randomLng = (-104.6700 + Math.random() * 0.0200).toFixed(4);

        // 3. Insertar automáticamente en la lista de clínicas activas
        await pool.query(
            `INSERT INTO clinicas_convenio (nombre, categoria, plan_minimo, direccion, lat, lng)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [empresa_nombre, 'Clínica Convenio', plan_empresa, 'Durango, Dgo. (Sede Registrada)', randomLat, randomLng]
        );

        res.json({ exito: true, empresa: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/empresa/:id', async (req, res) => {
    try {
        // Obtener el nombre de la empresa antes de borrarla
        const empQuery = await pool.query('SELECT empresa_nombre FROM convenios_empresas WHERE id = $1', [req.params.id]);
        if (empQuery.rows.length > 0) {
            const nombreEmpresa = empQuery.rows[0].empresa_nombre;
            // Eliminar de clinicas_convenio también
            await pool.query('DELETE FROM clinicas_convenio WHERE nombre = $1', [nombreEmpresa]);
        }
        await pool.query('DELETE FROM convenios_empresas WHERE id = $1', [req.params.id]);
        res.json({ exito: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* ==================== CONSULTA DE CLINICAS Y CITAS ==================== */

app.get('/api/clinicas', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM clinicas_convenio ORDER BY id DESC');
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
app.listen(PORT, () => console.log(`🚀 Servidor CAREMED activo en puerto ${PORT}`));