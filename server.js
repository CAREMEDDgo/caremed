// server.js - Servidor Backend C.A.R.E.M.E.D. con Base de Datos en la Nube
const express = require('express');
const path = require('path');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ⚠️ PEGA AQUÍ LA CADENA DE CONEXIÓN QUE COPIASTE DE TU BASE DE DATOS EN LA NUBE
const connectionString = 'postgresql://neondb_owner:npg_Ed9F0GTxMaSf@ep-holy-river-avn96o5k-pooler.c-11.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false } // Requerido para conexiones seguras en la nube
});

// Probar conexión a la BD
pool.connect((err) => {
    if (err) {
        console.error('❌ Error al conectar a la base de datos en la nube:', err.message);
    } else {
        console.log('⚡ Conectado con éxito a la Base de Datos PostgreSQL en la nube!');
    }
});

// ENDPOINTS API REST REALES

// 1. Obtener catálogo desde la nube
app.get('/api/equipos', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT * FROM equipos_medicos ORDER BY id DESC');
        res.json({ exito: true, data: resultado.rows });
    } catch (error) {
        res.status(500).json({ exito: false, mensaje: error.message });
    }
});

// 2. Publicar nuevo equipo y guardarlo permanentemente
app.post('/api/equipos', async (req, res) => {
    const { nombre, categoria, precio, proveedor } = req.body;
    const lat = 24.0277 + (Math.random() - 0.5) * 0.02;
    const lng = -104.6532 + (Math.random() - 0.5) * 0.02;

    try {
        const nuevo = await pool.query(
            'INSERT INTO equipos_medicos (nombre, categoria, precio, proveedor, lat, lng) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [nombre, categoria, parseFloat(precio), proveedor, lat, lng]
        );
        res.json({ exito: true, mensaje: "Guardado permanentemente en la nube", data: nuevo.rows[0] });
    } catch (error) {
        res.status(500).json({ exito: false, mensaje: error.message });
    }
});

// Instancia de Stripe (Utiliza clave de pruebas de Stripe)
const stripe = require('stripe')('sk_test_51PxPlaceholderKeyForTestingCaremed1234567890');

// Endpoint para procesar el Checkout de la Renta
app.post('/api/crear-pago-renta', async (req, res) => {
    const { nombreEquipo, precio, proveedor } = req.body;

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'mxn',
                        product_data: {
                            name: `Renta: ${nombreEquipo}`,
                            description: `Proveedor: ${proveedor} (vía C.A.R.E.M.E.D. Durango)`,
                        },
                        unit_amount: Math.round(precio * 100), // Monto en centavos
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: 'http://localhost:3000/?pago=exito',
            cancel_url: 'http://localhost:3000/?pago=cancelado',
        });

        res.json({ exito: true, url: session.url });
    } catch (error) {
        console.error("Error Stripe:", error);
        res.status(500).json({ exito: false, mensaje: error.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`\n===========================================`);
    console.log(`🚀 C.A.R.E.M.E.D. corriendo en http://localhost:${PORT}`);
    console.log(`===========================================\n`);
});